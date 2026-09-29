import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { PASSWORD_POLICY } from "@/lib/password-policy";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, "prelogin", 10, 60);
  if (limited) return limited;

  const { email, password } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user || !user.isActive) {
    return NextResponse.json({ valid: false, error: "Invalid credentials" }, { status: 401 });
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return NextResponse.json(
      { valid: false, error: "Account temporarily locked. Try again later." },
      { status: 423 }
    );
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

    return NextResponse.json({ valid: false, error: "Invalid credentials" }, { status: 401 });
  }

  return NextResponse.json({
    valid: true,
    mfaRequired: user.mfaEnabled && !!user.mfaSecret,
  });
}
