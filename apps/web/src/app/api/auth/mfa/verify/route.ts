import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { verifyMfaToken } from "@/lib/mfa";
import { mfaVerifySchema } from "@/lib/validators";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const parsed = mfaVerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid token format" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
  });

  if (!user?.mfaSecret) {
    return NextResponse.json({ error: "MFA not initialized" }, { status: 400 });
  }

  if (!verifyMfaToken(user.mfaSecret, parsed.data.token)) {
    return NextResponse.json({ error: "Invalid MFA token" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: true },
  });

  await logAudit({
    userId: user.id,
    action: "MFA_ENABLED",
    resource: "auth",
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json({ success: true, mfaEnabled: true });
}
