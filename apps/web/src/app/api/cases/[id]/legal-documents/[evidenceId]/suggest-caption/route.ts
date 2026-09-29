import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { suggestLegalCaptionFromDocument } from "@/lib/legal-automation-engine";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; evidenceId: string }> }
) {
  const { error, session } = await requireAuth("cases:read");
  if (error) return error;

  const { id: caseId, evidenceId } = await params;
  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const doc = await prisma.evidence.findFirst({
    where: { id: evidenceId, caseId },
    select: { fileName: true, legalCategory: true, ocrTextExcerpt: true, legalCaption: true },
  });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const suggestion = suggestLegalCaptionFromDocument(doc);
  return NextResponse.json({
    psAlignment: "SIH26190",
    evidenceId,
    currentCaption: doc.legalCaption,
    ...suggestion,
  });
}
