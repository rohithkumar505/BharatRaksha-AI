import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getEvidenceForUser } from "@/lib/evidence-access";
import { recordCustodyEvent } from "@/lib/blockchain";
import { prisma } from "@/lib/db";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("evidence:transfer");
  if (error) return error;

  const { id: evidenceId } = await params;
  const { evidence, forbidden } = await getEvidenceForUser(evidenceId, session!.user);

  if (forbidden) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!evidence) {
    return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
  }

  const pending = await prisma.custodyLog.findFirst({
    where: {
      evidenceId,
      transferStatus: "PENDING_RECIPIENT",
      transferredToId: session!.user.id,
    },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });

  if (!pending) {
    return NextResponse.json({ error: "No pending transfer for you on this document" }, { status: 404 });
  }

  const recipientConfirmedAt = new Date();
  await prisma.custodyLog.update({
    where: { id: pending.id },
    data: {
      transferStatus: "CONFIRMED",
      recipientConfirmedAt,
    },
  });

  const { block } = await recordCustodyEvent({
    evidenceId,
    event: "TRANSFERRED",
    userId: session!.user.id,
    hashAtEvent: evidence.sha256Hash,
    transferredToId: session!.user.id,
    transferStatus: "CONFIRMED",
    recipientConfirmedAt,
    details: `Recipient confirmed custody from ${pending.user.name}`,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
    payload: {
      confirmsCustodyLogId: pending.id,
      confirmed: true,
    },
  });

  await logAudit({
    userId: session!.user.id,
    action: "CUSTODY_TRANSFER_CONFIRMED",
    resource: "evidence",
    resourceId: evidenceId,
    details: { pendingLogId: pending.id, blockHash: block.blockHash },
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json({
    message: "Custody transfer complete — dual confirmation on ledger",
    status: "CONFIRMED",
    blockHash: block.blockHash,
  });
}
