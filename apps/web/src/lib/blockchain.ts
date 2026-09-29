import { downloadEvidenceFile, computeSha256 } from "./s3";
import { prisma } from "./db";
import {
  appendLedgerBlock,
  verifyEvidenceLedgerChain,
  verifyGlobalLedgerChain,
} from "./evidence-ledger";

export async function anchorEvidenceHash(params: {
  evidenceId: string;
  sha256Hash: string;
  caseId: string;
  uploaderId: string;
  fileName?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<string> {
  const now = new Date();
  await appendLedgerBlock({
    evidenceId: params.evidenceId,
    event: "COLLECTED",
    userId: params.uploaderId,
    hashAtEvent: params.sha256Hash,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    custodyDetails: params.fileName
      ? `Evidence collected / received: ${params.fileName}`
      : "Evidence collected for digital register",
    payload: {
      evidenceId: params.evidenceId,
      caseId: params.caseId,
      fileName: params.fileName,
      phase: "collection",
    },
    senderConfirmedAt: now,
  });

  const { block } = await appendLedgerBlock({
    evidenceId: params.evidenceId,
    event: "UPLOADED",
    userId: params.uploaderId,
    hashAtEvent: params.sha256Hash,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    custodyDetails: params.fileName
      ? `Evidence uploaded: ${params.fileName}`
      : "Evidence uploaded and SHA-256 computed",
    payload: {
      evidenceId: params.evidenceId,
      sha256Hash: params.sha256Hash,
      caseId: params.caseId,
      fileName: params.fileName,
      phase: "upload",
    },
    senderConfirmedAt: now,
  });

  return block.blockHash;
}

export async function recordCustodyEvent(params: {
  evidenceId: string;
  event: "VIEWED" | "ACCESSED" | "EXPORTED" | "TRANSFERRED" | "VERIFIED" | "ARCHIVED" | "COLLECTED";
  userId: string;
  hashAtEvent?: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  transferredToId?: string;
  payload?: Record<string, unknown>;
  transferStatus?: "NOT_APPLICABLE" | "PENDING_RECIPIENT" | "CONFIRMED";
  senderConfirmedAt?: Date;
  recipientConfirmedAt?: Date;
}) {
  return appendLedgerBlock({
    evidenceId: params.evidenceId,
    event: params.event,
    userId: params.userId,
    hashAtEvent: params.hashAtEvent,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    transferredToId: params.transferredToId,
    custodyDetails: params.details,
    transferStatus: params.transferStatus,
    senderConfirmedAt: params.senderConfirmedAt,
    recipientConfirmedAt: params.recipientConfirmedAt,
    payload: {
      evidenceId: params.evidenceId,
      ...params.payload,
    },
  });
}

export async function verifyEvidenceIntegrity(evidenceId: string): Promise<{
  verified: boolean;
  fileVerified: boolean;
  chainVerified: boolean;
  currentHash: string;
  storedHash: string;
  blockHash: string | null;
  chainMessage: string;
  globalLedgerMessage: string;
  custodyEventCount: number;
}> {
  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
  });
  if (!evidence) throw new Error("Evidence not found");

  const buffer = await downloadEvidenceFile(evidence.filePath);
  const currentHash = computeSha256(buffer);
  const fileVerified = currentHash === evidence.sha256Hash;

  const chainResult = await verifyEvidenceLedgerChain(evidenceId);
  const globalResult = await verifyGlobalLedgerChain();

  const chainVerified = chainResult.valid && globalResult.valid;
  const verified = fileVerified && chainVerified;

  return {
    verified,
    fileVerified,
    chainVerified,
    currentHash,
    storedHash: evidence.sha256Hash,
    blockHash: evidence.blockchainTxId,
    chainMessage: chainResult.message,
    globalLedgerMessage: globalResult.message,
    custodyEventCount: chainResult.blockCount,
  };
}

export { verifyGlobalLedgerChain, verifyEvidenceLedgerChain, getEvidenceCustodyChain } from "./evidence-ledger";
