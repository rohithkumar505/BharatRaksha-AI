import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { uploadEvidenceFile } from "@/lib/s3";
import { anchorEvidenceHash } from "@/lib/blockchain";
import { enqueueIngestion } from "@/lib/queue";
import { processEvidence, evidenceTypeFromMime } from "@/lib/ingestion";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";
import { canAccessCase } from "@/lib/case-access";
import { evidenceTypeSchema, ALLOWED_MIME_TYPES } from "@/lib/validators";
import { rateLimit } from "@/lib/rate-limit";
import { scanFileBuffer, isDangerousExtension } from "@/lib/file-security";
import { v4 as uuidv4 } from "uuid";
import {
  ClassificationLevel,
  EvidenceType,
  LegalDocumentCategory,
} from "@bharat-raksha/database";
import { nextRegisterNumber, nextExhibitLabel, inferLegalCategoryFromFileName, notifyLegalDocumentRegistered } from "@/lib/legal-documents";
import { LEGAL_DOCUMENT_CATEGORIES } from "@/lib/legal-document-constants";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("evidence:read");
  if (error) return error;

  const { id: caseId } = await params;
  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobs = await prisma.ingestionJob.findMany({
    where: { evidence: { caseId } },
    include: {
      evidence: { select: { fileName: true, type: true, id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(jobs);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimited = await rateLimit(request, "ingest", 60, 3600);
  if (rateLimited) return rateLimited;

  const { error, session } = await requireAuth("evidence:upload");
  if (error) return error;

  const { id: caseId } = await params;

  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const typeOverride = formData.get("type") as string | null;
  const legalCategoryRaw = formData.get("legalCategory") as string | null;
  const legalCaption = (formData.get("legalCaption") as string | null)?.trim() || null;
  const classificationRaw = formData.get("classification") as string | null;
  const parentEvidenceIdRaw = (formData.get("parentEvidenceId") as string | null)?.trim() || null;
  const legalWorkflowNote = (formData.get("legalWorkflowNote") as string | null)?.trim() || null;
  const retentionUntilRaw = (formData.get("retentionUntil") as string | null)?.trim() || null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (isDangerousExtension(file.name)) {
    return NextResponse.json({ error: "Dangerous file type blocked" }, { status: 400 });
  }

  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
  }

  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowedExt = ["txt", "csv", "pdf", "doc", "docx", "jpg", "jpeg", "png", "webp"];
    if (!ext || !allowedExt.includes(ext)) {
      return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    }
  }

  if (typeOverride) {
    const typeParsed = evidenceTypeSchema.safeParse(typeOverride);
    if (!typeParsed.success) {
      return NextResponse.json({ error: "Invalid evidence type" }, { status: 400 });
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const scan = scanFileBuffer(buffer, file.name, file.type || undefined);
  if (!scan.safe) {
    return NextResponse.json({ error: scan.reason ?? "File failed security scan" }, { status: 400 });
  }

  const fileKey = `${caseId}/${uuidv4()}-${file.name}`;
  const { path, sha256 } = await uploadEvidenceFile(fileKey, buffer, file.type);

  const evidenceType: EvidenceType =
    (typeOverride as EvidenceType) ??
    evidenceTypeFromMime(file.type, file.name);

  let legalCategory: LegalDocumentCategory = LEGAL_DOCUMENT_CATEGORIES.includes(
    legalCategoryRaw as (typeof LEGAL_DOCUMENT_CATEGORIES)[number]
  )
    ? (legalCategoryRaw as LegalDocumentCategory)
    : "INVESTIGATION_RECORD";

  if (!legalCategoryRaw || legalCategoryRaw === "INVESTIGATION_RECORD") {
    legalCategory = inferLegalCategoryFromFileName(file.name);
  }

  const classifications = ["OFFICIAL", "RESTRICTED", "CONFIDENTIAL"] as const;
  const classification: ClassificationLevel = classifications.includes(
    classificationRaw as ClassificationLevel
  )
    ? (classificationRaw as ClassificationLevel)
    : "OFFICIAL";

  let registerNumber = await nextRegisterNumber(caseId);
  let exhibitLabel =
    legalCategory === "EXHIBIT" ? await nextExhibitLabel(caseId) : undefined;
  let documentVersion = 1;
  let parentEvidenceId: string | undefined;

  if (parentEvidenceIdRaw) {
    const parent = await prisma.evidence.findFirst({
      where: { id: parentEvidenceIdRaw, caseId },
    });
    if (!parent) {
      return NextResponse.json({ error: "Parent document not found for versioning" }, { status: 400 });
    }
    if (parent.legalHold || parent.documentStatus === "SEALED") {
      return NextResponse.json({ error: "Cannot version a sealed or legal-hold document" }, { status: 400 });
    }
    parentEvidenceId = parent.id;
    documentVersion = parent.documentVersion + 1;
    registerNumber = parent.registerNumber ?? registerNumber;
    exhibitLabel = parent.exhibitLabel ?? exhibitLabel;
  }

  const retentionUntil = retentionUntilRaw ? new Date(retentionUntilRaw) : null;
  if (retentionUntilRaw && Number.isNaN(retentionUntil!.getTime())) {
    return NextResponse.json({ error: "Invalid retentionUntil date" }, { status: 400 });
  }

  const evidence = await prisma.evidence.create({
    data: {
      caseId,
      type: evidenceType,
      fileName: file.name,
      filePath: path,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      sha256Hash: sha256,
      uploadedById: session!.user.id,
      ingestionStatus: "PENDING",
      legalCategory,
      classification,
      legalCaption,
      registerNumber,
      exhibitLabel,
      documentStatus:
        legalCategory === "FIR" || legalCategory === "WITNESS_STATEMENT"
          ? "UNDER_REVIEW"
          : "REGISTERED",
      documentVersion,
      parentEvidenceId,
      legalWorkflowNote,
      retentionUntil,
    },
  });

  const txId = await anchorEvidenceHash({
    evidenceId: evidence.id,
    sha256Hash: sha256,
    caseId,
    uploaderId: session!.user.id,
    fileName: file.name,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  await prisma.evidence.update({
    where: { id: evidence.id },
    data: { blockchainTxId: txId },
  });

  const job = await prisma.ingestionJob.create({
    data: { evidenceId: evidence.id, status: "PENDING" },
  });

  await logAudit({
    userId: session!.user.id,
    action: "UPLOAD",
    resource: "evidence",
    resourceId: evidence.id,
    details: { fileName: file.name, type: evidenceType, sha256 },
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  const queued = await enqueueIngestion(evidence.id, job.id);

  if (!queued) {
    processEvidence(evidence.id, job.id).catch((err) => {
      console.error(`Ingestion failed for ${evidence.id}:`, err);
    });
  }

  await notifyLegalDocumentRegistered({
    caseId,
    evidenceId: evidence.id,
    fileName: file.name,
    registerNumber: evidence.registerNumber,
  }).catch(console.error);

  return NextResponse.json(
    { evidence, job: { id: job.id, status: job.status, progress: 0 } },
    { status: 201 }
  );
}
