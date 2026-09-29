import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma, UserRole } from "./db";
import { PASSWORD_POLICY } from "./password-policy";
import { verifyMfaToken } from "./mfa";
import { logger } from "./logger";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      policeStation?: string | null;
      mfaEnabled: boolean;
    };
  }
  interface User {
    role: UserRole;
    policeStation?: string | null;
    mfaEnabled: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    policeStation?: string | null;
    mfaEnabled: boolean;
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        mfaToken: { label: "MFA Token", type: "text" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;
        const mfaToken = credentials?.mfaToken;

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || !user.isActive) {
          await prisma.loginAttempt.create({
            data: { email, success: false, reason: "USER_NOT_FOUND_OR_INACTIVE" },
          });
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await prisma.loginAttempt.create({
            data: {
              email,
              userId: user.id,
              success: false,
              reason: "ACCOUNT_LOCKED",
            },
          });
          throw new Error("Account temporarily locked. Try again later.");
        }

        const valid = await bcrypt.compare(password, user.passwordHash);

        if (!valid) {
          const attempts = user.failedLoginAttempts + 1;
          const lockedUntil =
            attempts >= PASSWORD_POLICY.maxFailedAttempts
              ? new Date(Date.now() + PASSWORD_POLICY.lockoutMinutes * 60 * 1000)
              : null;

          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: attempts, lockedUntil },
          });

          await prisma.loginAttempt.create({
            data: {
              email,
              userId: user.id,
              success: false,
              reason: "INVALID_PASSWORD",
            },
          });

          await prisma.auditLog.create({
            data: {
              userId: user.id,
              action: "LOGIN_FAILED",
              resource: "auth",
              details: { email, attempts },
            },
          });

          logger.warn("Failed login attempt", { email, attempts });
          return null;
        }

        if (user.mfaEnabled && user.mfaSecret) {
          if (!mfaToken || !verifyMfaToken(user.mfaSecret, mfaToken)) {
            await prisma.loginAttempt.create({
              data: {
                email,
                userId: user.id,
                success: false,
                reason: "MFA_FAILED",
              },
            });
            throw new Error("MFA_REQUIRED");
          }
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        });

        await prisma.loginAttempt.create({
          data: { email, userId: user.id, success: true },
        });

        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: "LOGIN_SUCCESS",
            resource: "auth",
            details: { email },
          },
        });

        logger.audit("User logged in", { userId: user.id, email });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          policeStation: user.policeStation,
          mfaEnabled: user.mfaEnabled,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
    updateAge: 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.policeStation = user.policeStation;
        token.mfaEnabled = user.mfaEnabled;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.policeStation = token.policeStation;
        session.user.mfaEnabled = token.mfaEnabled;
      }
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      if (token?.id) {
        await prisma.auditLog.create({
          data: {
            userId: token.id as string,
            action: "LOGOUT",
            resource: "auth",
          },
        });
      }
    },
  },
};
