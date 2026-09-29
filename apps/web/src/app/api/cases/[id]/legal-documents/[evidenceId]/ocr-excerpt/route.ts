import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; evidenceId: string }> }
) {
  const { error, session } = await requireAuth("reports:read");
  if (error) return error;

  const { id: caseId, evidenceId } = await params;
  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const doc = await prisma.evidence.findFirst({
    where: { id: evidenceId, caseId },
    select: {
      id: true,
      fileName: true,
      ocrTextExcerpt: true,
      legalTags: true,
      ingestionJobs: { orderBy: { createdAt: "desc" }, take: 1, select: { result: true, status: true } },
    },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const jobResult = doc.ingestionJobs[0]?.result as Record<string, unknown> | undefined;
  const fromJob =
    typeof jobResult?.extractedText === "string"
      ? jobResult.extractedText
      : typeof jobResult?.text === "string"
        ? jobResult.text
        : null;

  return NextResponse.json({
    evidenceId: doc.id,
    fileName: doc.fileName,
    excerpt: doc.ocrTextExcerpt ?? fromJob,
    legalTags: doc.legalTags,
    smartAutomation: true,
  });
}
