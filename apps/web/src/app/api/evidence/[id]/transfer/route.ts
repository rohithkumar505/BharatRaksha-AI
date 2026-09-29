import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getEvidenceForUser } from "@/lib/evidence-access";
import { recordCustodyEvent } from "@/lib/blockchain";
import { prisma } from "@/lib/db";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";
import { z } from "zod";

const transferSchema = z.object({
  toUserId: z.string().min(1),
  reason: z.string().min(3).max(500),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("evidence:transfer");
  if (error) return error;

  const { id } = await params;
  const { evidence, forbidden } = await getEvidenceForUser(id, session!.user);

  if (forbidden) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!evidence) {
    return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = transferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid transfer request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { toUserId, reason } = parsed.data;

  if (toUserId === session!.user.id) {
    return NextResponse.json({ error: "Cannot transfer custody to yourself" }, { status: 400 });
  }

  const pending = await prisma.custodyLog.findFirst({
    where: { evidenceId: id, transferStatus: "PENDING_RECIPIENT" },
  });
  if (pending) {
    return NextResponse.json({ error: "A transfer is already pending recipient confirmation" }, { status: 409 });
  }

  const recipient = await prisma.user.findFirst({
    where: { id: toUserId, isActive: true, role: { in: ["INVESTIGATOR", "SENIOR_OFFICER", "ADMIN"] } },
    select: { id: true, name: true, email: true, badgeNumber: true },
  });

  if (!recipient) {
    return NextResponse.json({ error: "Recipient officer not found or inactive" }, { status: 404 });
  }

  const senderConfirmedAt = new Date();
  const { block, custodyLog } = await recordCustodyEvent({
    evidenceId: id,
    event: "TRANSFERRED",
    userId: session!.user.id,
    hashAtEvent: evidence.sha256Hash,
    transferredToId: toUserId,
    transferStatus: "PENDING_RECIPIENT",
    senderConfirmedAt,
    details: `Sender confirmed transfer to ${recipient.name} — awaiting recipient confirmation. Reason: ${reason}`,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
    payload: {
      transferredToId: toUserId,
      transferredToName: recipient.name,
      reason,
      pending: true,
    },
  });

  await logAudit({
    userId: session!.user.id,
    action: "CUSTODY_TRANSFER_INITIATED",
    resource: "evidence",
    resourceId: id,
    details: { toUserId, reason, blockHash: block.blockHash, custodyLogId: custodyLog?.id },
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json({
    message: "Transfer recorded — recipient must confirm to complete chain-of-custody",
    status: "PENDING_RECIPIENT",
    blockHash: block.blockHash,
    blockIndex: block.blockIndex,
    custodyLog,
    recipient,
  });
}
