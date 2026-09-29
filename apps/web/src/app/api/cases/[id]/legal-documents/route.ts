import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import {
  ensureCaseRegisterNumbers,
  listLegalDocuments,
  transitionDocumentStatus,
  updateLegalMetadata,
} from "@/lib/legal-documents";
import { LegalDocumentStatus, LegalDocumentCategory } from "@bharat-raksha/database";
import { LEGAL_DOCUMENT_CATEGORIES } from "@/lib/legal-document-constants";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";
import { z } from "zod";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("reports:read");
  if (error) return error;

  const { id: caseId } = await params;
  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const status = searchParams.get("status");

  await ensureCaseRegisterNumbers(caseId);
  const payload = await listLegalDocuments(caseId, {
    category:
      category && LEGAL_DOCUMENT_CATEGORIES.includes(category as (typeof LEGAL_DOCUMENT_CATEGORIES)[number])
        ? (category as LegalDocumentCategory)
        : undefined,
    status:
      status &&
      ["REGISTERED", "UNDER_REVIEW", "APPROVED_FOR_COURT", "SEALED", "ARCHIVED"].includes(status)
        ? (status as LegalDocumentStatus)
        : undefined,
  });
  return NextResponse.json(payload);
}

const patchSchema = z.object({
  evidenceId: z.string().min(1),
  action: z.enum(["transition", "update"]).optional(),
  targetStatus: z
    .enum(["REGISTERED", "UNDER_REVIEW", "APPROVED_FOR_COURT", "SEALED", "ARCHIVED"])
    .optional(),
  legalCategory: z.enum(LEGAL_DOCUMENT_CATEGORIES as unknown as [string, ...string[]]).optional(),
  classification: z.enum(["OFFICIAL", "RESTRICTED", "CONFIDENTIAL"]).optional(),
  legalCaption: z.string().max(8000).optional(),
  exhibitLabel: z.string().max(120).optional(),
  legalHold: z.boolean().optional(),
  legalWorkflowNote: z.string().max(8000).optional(),
  retentionUntil: z.string().datetime().nullable().optional(),
  linkDocumentId: z.string().optional(),
  unlinkDocumentId: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("evidence:upload");
  if (error) return error;

  const { id: caseId } = await params;
  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = patchSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const doc = await prisma.evidence.findFirst({
    where: { id: body.data.evidenceId, caseId },
  });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  try {
    if (body.data.linkDocumentId || body.data.unlinkDocumentId) {
      const current = await prisma.evidence.findUnique({ where: { id: doc.id } });
      if (!current) throw new Error("Document not found");
      let related = [...(current.relatedDocumentIds ?? [])];
      if (body.data.linkDocumentId && body.data.linkDocumentId !== doc.id) {
        if (!related.includes(body.data.linkDocumentId)) related.push(body.data.linkDocumentId);
      }
      if (body.data.unlinkDocumentId) {
        related = related.filter((id) => id !== body.data.unlinkDocumentId);
      }
      const updated = await prisma.evidence.update({
        where: { id: doc.id },
        data: { relatedDocumentIds: related },
      });
      return NextResponse.json({ document: updated });
    }

    if (body.data.targetStatus) {
      const updated = await transitionDocumentStatus({
        evidenceId: doc.id,
        targetStatus: body.data.targetStatus as LegalDocumentStatus,
        userId: session!.user.id,
        userRole: session!.user.role,
      });
      await logAudit({
        userId: session!.user.id,
        action: "LEGAL_DOC_STATUS",
        resource: "evidence",
        resourceId: doc.id,
        details: { targetStatus: body.data.targetStatus },
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      });
      return NextResponse.json({ document: updated });
    }

    const updated = await updateLegalMetadata({
      evidenceId: doc.id,
      legalCategory: body.data.legalCategory as LegalDocumentCategory | undefined,
      classification: body.data.classification,
      legalCaption: body.data.legalCaption,
      exhibitLabel: body.data.exhibitLabel,
      legalHold: body.data.legalHold,
      legalWorkflowNote: body.data.legalWorkflowNote,
      retentionUntil:
        body.data.retentionUntil === null
          ? null
          : body.data.retentionUntil
            ? new Date(body.data.retentionUntil)
            : undefined,
      userRole: session!.user.role,
    });
    await logAudit({
      userId: session!.user.id,
      action: "LEGAL_DOC_METADATA",
      resource: "evidence",
      resourceId: doc.id,
      details: { legalHold: body.data.legalHold, legalCategory: body.data.legalCategory },
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });
    return NextResponse.json({ document: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 400 }
    );
  }
}
