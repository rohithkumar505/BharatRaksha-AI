import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getEvidenceForUser } from "@/lib/evidence-access";
import { getEvidenceCustodyChain, verifyEvidenceLedgerChain, verifyGlobalLedgerChain } from "@/lib/blockchain";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("evidence:read");
  if (error) return error;

  const { id } = await params;
  const { evidence, forbidden } = await getEvidenceForUser(id, session!.user);

  if (forbidden) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!evidence) {
    return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
  }

  const chain = await getEvidenceCustodyChain(id);
  const evidenceChain = await verifyEvidenceLedgerChain(id);
  const globalLedger = await verifyGlobalLedgerChain();

  return NextResponse.json({
    evidenceId: id,
    fileName: evidence.fileName,
    sha256Hash: evidence.sha256Hash,
    blockHash: evidence.blockchainTxId,
    events: chain.map((e) => ({
      id: e.id,
      event: e.event,
      timestamp: e.createdAt,
      officer: e.user,
      details: e.details,
      hashAtEvent: e.hashAtEvent,
      ipAddress: e.ipAddress,
      transferredToId: e.transferredToId,
      transferStatus: e.transferStatus,
      senderConfirmedAt: e.senderConfirmedAt,
      recipientConfirmedAt: e.recipientConfirmedAt,
      recipient: e.transferredTo,
      ledger: e.ledgerBlock
        ? {
            blockIndex: e.ledgerBlock.blockIndex,
            blockHash: e.ledgerBlock.blockHash,
            previousHash: e.ledgerBlock.previousHash,
            onChainTxId: e.ledgerBlock.onChainTxId,
          }
        : null,
    })),
    chainStatus: evidenceChain,
    globalLedger,
  });
}
