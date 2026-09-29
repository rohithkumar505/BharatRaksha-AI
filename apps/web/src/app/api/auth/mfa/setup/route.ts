import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { generateMfaSecret, generateMfaQrDataUrl } from "@/lib/mfa";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const secret = generateMfaSecret();
  const qrCode = await generateMfaQrDataUrl(session!.user.email, secret);

  await prisma.user.update({
    where: { id: session!.user.id },
    data: { mfaSecret: secret },
  });

  await logAudit({
    userId: session!.user.id,
    action: "MFA_SETUP_INITIATED",
    resource: "auth",
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json({ qrCode, secret });
}
