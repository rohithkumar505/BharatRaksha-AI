import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import {
  ClassificationLevel,
  EvidenceType,
  LegalDocumentCategory,
} from "@bharat-raksha/database";
import { prisma } from "./db";
import { uploadEvidenceFile } from "./s3";
import { anchorEvidenceHash } from "./blockchain";
import { enqueueIngestion } from "./queue";
import { processEvidence, evidenceTypeFromMime } from "./ingestion";
import {
  inferLegalCategoryFromFileName,
  nextExhibitLabel,
  nextRegisterNumber,
  notifyLegalDocumentRegistered,
} from "./legal-documents";
import { LEGAL_DOCUMENT_CATEGORIES } from "./legal-document-constants";

export async function loadTestdataFile(fileName: string): Promise<Buffer> {
  const candidates = [
    path.join(process.cwd(), "testdata", fileName),
    path.join(process.cwd(), "..", "..", "testdata", fileName),
    path.join(process.cwd(), "..", "testdata", fileName),
  ];
  for (const p of candidates) {
    try {
      return await fs.readFile(p);
    } catch {
      /* try next */
    }
  }
  throw new Error(`Sample file not found: ${fileName}`);
}

export async function registerLegalFile(params: {
  caseId: string;
  userId: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
  legalCategory?: LegalDocumentCategory;
  legalCaption?: string | null;
  classification?: ClassificationLevel;
  ipAddress?: string;
  userAgent?: string;
}) {
  const legalCategory =
    params.legalCategory ?? inferLegalCategoryFromFileName(params.fileName);

  const classification = params.classification ?? "OFFICIAL";
  const registerNumber = await nextRegisterNumber(params.caseId);
  const exhibitLabel =
    legalCategory === "EXHIBIT" ? await nextExhibitLabel(params.caseId) : undefined;

  const fileKey = `${params.caseId}/${uuidv4()}-${params.fileName}`;
  const { path: filePath, sha256 } = await uploadEvidenceFile(
    fileKey,
    params.buffer,
    params.mimeType
  );

  const evidenceType: EvidenceType = evidenceTypeFromMime(params.mimeType, params.fileName);

  const retentionUntil = new Date();
  retentionUntil.setFullYear(retentionUntil.getFullYear() + 7);

  const evidence = await prisma.evidence.create({
    data: {
      caseId: params.caseId,
      type: evidenceType,
      fileName: params.fileName,
      filePath,
      fileSize: params.buffer.length,
      mimeType: params.mimeType,
      sha256Hash: sha256,
      uploadedById: params.userId,
      ingestionStatus: "PENDING",
      legalCategory: LEGAL_DOCUMENT_CATEGORIES.includes(
        legalCategory as (typeof LEGAL_DOCUMENT_CATEGORIES)[number]
      )
        ? legalCategory
        : "INVESTIGATION_RECORD",
      classification,
      legalCaption: params.legalCaption,
      registerNumber,
      exhibitLabel,
      documentStatus:
        legalCategory === "FIR" || legalCategory === "WITNESS_STATEMENT"
          ? "UNDER_REVIEW"
          : "REGISTERED",
      retentionUntil,
    },
  });

  const txId = await anchorEvidenceHash({
    evidenceId: evidence.id,
    sha256Hash: sha256,
    caseId: params.caseId,
    uploaderId: params.userId,
    fileName: params.fileName,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  await prisma.evidence.update({
    where: { id: evidence.id },
    data: { blockchainTxId: txId },
  });

  const job = await prisma.ingestionJob.create({
    data: { evidenceId: evidence.id, status: "PENDING" },
  });

  const queued = await enqueueIngestion(evidence.id, job.id);
  if (!queued) {
    processEvidence(evidence.id, job.id).catch(console.error);
  }

  await notifyLegalDocumentRegistered({
    caseId: params.caseId,
    evidenceId: evidence.id,
    fileName: params.fileName,
    registerNumber: evidence.registerNumber,
  }).catch(console.error);

  return { evidence, job };
}
