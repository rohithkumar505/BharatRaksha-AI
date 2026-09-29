import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";
import { hasPermission } from "./permissions";
import { UserRole } from "./db";

export async function getSession() {
  return getServerSession(authOptions);
}

export async function requireAuth(permission?: string) {
  const session = await getSession();
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      session: null,
    };
  }
  if (permission && !hasPermission(session.user.role as UserRole, permission)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      session: null,
    };
  }
  return { error: null, session };
}
