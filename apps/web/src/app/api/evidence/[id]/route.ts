import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getEvidenceForUser } from "@/lib/evidence-access";
import { getEvidenceCustodyChain, verifyEvidenceLedgerChain } from "@/lib/blockchain";
import { recordCustodyEvent } from "@/lib/blockchain";
import { getClientIp, getUserAgent } from "@/lib/audit";

export async function GET(
  request: NextRequest,
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

  await recordCustodyEvent({
    evidenceId: id,
    event: "VIEWED",
    userId: session!.user.id,
    hashAtEvent: evidence.sha256Hash,
    details: `Evidence metadata viewed: ${evidence.fileName}`,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
    payload: { fileName: evidence.fileName, action: "metadata_view" },
  });

  const chain = await getEvidenceCustodyChain(id);
  const chainStatus = await verifyEvidenceLedgerChain(id);

  return NextResponse.json({
    evidence: {
      id: evidence.id,
      fileName: evidence.fileName,
      type: evidence.type,
      fileSize: evidence.fileSize,
      mimeType: evidence.mimeType,
      sha256Hash: evidence.sha256Hash,
      blockchainTxId: evidence.blockchainTxId,
      ingestionStatus: evidence.ingestionStatus,
      uploadedBy: evidence.uploadedBy,
      case: evidence.case,
      createdAt: evidence.createdAt,
    },
    custodyChain: chain,
    chainStatus,
  });
}
