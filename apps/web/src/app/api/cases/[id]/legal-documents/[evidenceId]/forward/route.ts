import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { forwardLegalCustody } from "@/lib/legal-documents";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";
import { z } from "zod";

const bodySchema = z.object({
  toEmail: z.string().email(),
  note: z.string().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; evidenceId: string }> }
) {
  const { error, session } = await requireAuth("evidence:transfer");
  if (error) return error;

  const { id: caseId, evidenceId } = await params;
  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const toUser = await prisma.user.findUnique({
    where: { email: parsed.data.toEmail.toLowerCase().trim() },
  });
  if (!toUser?.isActive) {
    return NextResponse.json({ error: "Receiving officer not found" }, { status: 404 });
  }

  try {
    const log = await forwardLegalCustody({
      evidenceId,
      caseId,
      fromUserId: session!.user.id,
      toUserId: toUser.id,
      note: parsed.data.note,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });
    await logAudit({
      userId: session!.user.id,
      action: "LEGAL_NAZARAT_FORWARD",
      resource: "evidence",
      resourceId: evidenceId,
      details: { toEmail: toUser.email },
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });
    return NextResponse.json({ success: true, custodyLogId: log.id, toOfficer: toUser.name });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forward failed" },
      { status: 400 }
    );
  }
}
