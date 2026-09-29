import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { changePasswordSchema } from "@/lib/validators";
import { validatePassword } from "@/lib/password-policy";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const passwordCheck = validatePassword(parsed.data.newPassword);
  if (!passwordCheck.valid) {
    return NextResponse.json({ error: passwordCheck.errors }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordChangedAt: new Date() },
  });

  await logAudit({
    userId: user.id,
    action: "PASSWORD_CHANGED",
    resource: "auth",
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json({ success: true });
}
