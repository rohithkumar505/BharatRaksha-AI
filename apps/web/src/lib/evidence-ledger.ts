import { createHash } from "crypto";
import { CustodyEvent, Prisma } from "@bharat-raksha/database";
import { prisma } from "./db";

/** Genesis hash for the first ledger block (Bitcoin-style chain origin). */
export const GENESIS_HASH = "0".repeat(64);

export type LedgerPayload = {
  evidenceId?: string;
  sha256Hash?: string;
  fileName?: string;
  caseId?: string;
  reason?: string;
  transferredToId?: string;
  transferredToName?: string;
  verified?: boolean;
  exportFormat?: string;
  [key: string]: unknown;
};

/** Stable JSON for hash computation (PostgreSQL JSONB reorders keys). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(",")}}`;
}

export function computeBlockHash(params: {
  blockIndex: number;
  previousHash: string;
  event: CustodyEvent;
  userId: string;
  payload: LedgerPayload;
}): string {
  return createHash("sha256")
    .update(
      stableStringify({
        blockIndex: params.blockIndex,
        previousHash: params.previousHash,
        event: params.event,
        userId: params.userId,
        payload: params.payload,
      })
    )
    .digest("hex");
}

async function getNextBlockIndex(tx: Prisma.TransactionClient): Promise<number> {
  const last = await tx.ledgerBlock.findFirst({
    orderBy: { blockIndex: "desc" },
    select: { blockIndex: true },
  });
  return (last?.blockIndex ?? -1) + 1;
}

async function getLastBlockHash(tx: Prisma.TransactionClient): Promise<string> {
  const last = await tx.ledgerBlock.findFirst({
    orderBy: { blockIndex: "desc" },
    select: { blockHash: true },
  });
  return last?.blockHash ?? GENESIS_HASH;
}

/** Optional on-chain anchor via HTTP service or JSON-RPC env configuration. */
export async function anchorToOnChain(blockHash: string): Promise<string | null> {
  const anchorUrl = process.env.BLOCKCHAIN_ANCHOR_URL;
  if (anchorUrl) {
    try {
      const res = await fetch(anchorUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash: blockHash, network: process.env.BLOCKCHAIN_NETWORK ?? "polygon-amoy" }),
      });
      if (res.ok) {
        const data = (await res.json()) as { txId?: string; txHash?: string };
        return data.txId ?? data.txHash ?? null;
      }
    } catch (err) {
      console.error("[Ledger] Anchor service failed:", err);
    }
  }

  if (process.env.BLOCKCHAIN_RPC_URL && process.env.EVIDENCE_CONTRACT_ADDRESS) {
    console.log(`[Ledger] On-chain anchor ready for hash ${blockHash.slice(0, 16)}... (configure BLOCKCHAIN_ANCHOR_URL for live tx)`);
    return `pending-${blockHash.slice(0, 24)}`;
  }

  return null;
}

export async function appendLedgerBlock(params: {
  evidenceId?: string;
  event: CustodyEvent;
  userId: string;
  payload: LedgerPayload;
  ipAddress?: string;
  userAgent?: string;
  transferredToId?: string;
  custodyDetails?: string;
  hashAtEvent?: string;
  transferStatus?: "NOT_APPLICABLE" | "PENDING_RECIPIENT" | "CONFIRMED";
  senderConfirmedAt?: Date;
  recipientConfirmedAt?: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const blockIndex = await getNextBlockIndex(tx);
    const previousHash = await getLastBlockHash(tx);

    const blockHash = computeBlockHash({
      blockIndex,
      previousHash,
      event: params.event,
      userId: params.userId,
      payload: params.payload,
    });

    const onChainTxId = await anchorToOnChain(blockHash);

    const block = await tx.ledgerBlock.create({
      data: {
        blockIndex,
        evidenceId: params.evidenceId,
        event: params.event,
        userId: params.userId,
        payload: params.payload as Prisma.InputJsonValue,
        previousHash,
        blockHash,
        onChainTxId,
        ipAddress: params.ipAddress,
      },
    });

    let custodyLog = null;
    if (params.evidenceId) {
      custodyLog = await tx.custodyLog.create({
        data: {
          evidenceId: params.evidenceId,
          event: params.event,
          userId: params.userId,
          hashAtEvent: params.hashAtEvent,
          details: params.custodyDetails,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          transferredToId: params.transferredToId,
          transferStatus: params.transferStatus ?? "NOT_APPLICABLE",
          senderConfirmedAt: params.senderConfirmedAt,
          recipientConfirmedAt: params.recipientConfirmedAt,
          ledgerBlockId: block.id,
        },
        include: {
          user: { select: { id: true, name: true, email: true, badgeNumber: true } },
        },
      });
    }

    return { block, custodyLog };
  });
}

export async function verifyGlobalLedgerChain(): Promise<{
  valid: boolean;
  blockCount: number;
  brokenAt?: number;
  message: string;
}> {
  const blocks = await prisma.ledgerBlock.findMany({
    orderBy: { blockIndex: "asc" },
  });

  if (blocks.length === 0) {
    return { valid: true, blockCount: 0, message: "Ledger empty — no blocks yet" };
  }

  let expectedPrevious = GENESIS_HASH;

  for (const block of blocks) {
    if (block.previousHash !== expectedPrevious) {
      return {
        valid: false,
        blockCount: blocks.length,
        brokenAt: block.blockIndex,
        message: `Chain broken at block #${block.blockIndex}: previous hash mismatch`,
      };
    }

    const recomputed = computeBlockHash({
      blockIndex: block.blockIndex,
      previousHash: block.previousHash,
      event: block.event,
      userId: block.userId,
      payload: block.payload as LedgerPayload,
    });

    if (recomputed !== block.blockHash) {
      return {
        valid: false,
        blockCount: blocks.length,
        brokenAt: block.blockIndex,
        message: `Chain broken at block #${block.blockIndex}: block hash tampered`,
      };
    }

    expectedPrevious = block.blockHash;
  }

  return {
    valid: true,
    blockCount: blocks.length,
    message: `Global ledger verified — ${blocks.length} blocks intact`,
  };
}

export async function verifyEvidenceLedgerChain(evidenceId: string): Promise<{
  valid: boolean;
  blockCount: number;
  message: string;
  uploadHashMatch: boolean;
}> {
  const evidence = await prisma.evidence.findUnique({ where: { id: evidenceId } });
  if (!evidence) {
    return { valid: false, blockCount: 0, message: "Evidence not found", uploadHashMatch: false };
  }

  const blocks = await prisma.ledgerBlock.findMany({
    where: { evidenceId },
    orderBy: { blockIndex: "asc" },
  });

  if (blocks.length === 0) {
    return {
      valid: false,
      blockCount: 0,
      message: "No ledger blocks for this evidence",
      uploadHashMatch: false,
    };
  }

  const globalCheck = await verifyGlobalLedgerChain();
  if (!globalCheck.valid) {
    return {
      valid: false,
      blockCount: blocks.length,
      message: globalCheck.message,
      uploadHashMatch: false,
    };
  }

  const uploadBlock = blocks.find((b) => b.event === "UPLOADED");
  const payload = uploadBlock?.payload as LedgerPayload | undefined;
  const uploadHashMatch = payload?.sha256Hash === evidence.sha256Hash;
  const blockHashMatch = evidence.blockchainTxId
    ? blocks.some((b) => b.blockHash === evidence.blockchainTxId)
    : !!uploadBlock;

  return {
    valid: uploadHashMatch && blockHashMatch,
    blockCount: blocks.length,
    message: uploadHashMatch
      ? `Evidence chain verified — ${blocks.length} custody events on ledger`
      : "Upload block hash does not match stored evidence SHA-256",
    uploadHashMatch,
  };
}

export async function getEvidenceCustodyChain(evidenceId: string) {
  return prisma.custodyLog.findMany({
    where: { evidenceId },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true, badgeNumber: true, role: true } },
      transferredTo: { select: { id: true, name: true, email: true, badgeNumber: true, role: true } },
      ledgerBlock: {
        select: {
          blockIndex: true,
          blockHash: true,
          previousHash: true,
          onChainTxId: true,
          payload: true,
        },
      },
    },
  });
}
