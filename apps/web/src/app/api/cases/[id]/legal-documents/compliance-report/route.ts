import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import {
  buildCourtReadinessChecklist,
  ensureCaseRegisterNumbers,
  verifyCaseDocumentBundle,
} from "@/lib/legal-documents";
import { buildLegalCompliancePdf } from "@/lib/legal-compliance-pdf";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("reports:generate");
  if (error) return error;

  const { id: caseId } = await params;
  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureCaseRegisterNumbers(caseId);
  const [readiness, verify] = await Promise.all([
    buildCourtReadinessChecklist(caseId),
    verifyCaseDocumentBundle(caseId).catch(() => ({
      passed: 0,
      total: 0,
      allVerified: false,
      results: [],
    })),
  ]);

  const pdf = await buildLegalCompliancePdf({
    caseNumber: caseData.caseNumber,
    generatedAt: new Date().toISOString(),
    readinessScore: readiness.score,
    documentCount: readiness.summary.totalDocuments,
    integrityPassed: verify.passed,
    integrityTotal: verify.total,
    steps: readiness.steps.map((s) => ({ label: s.label, done: s.done })),
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="compliance-${caseData.caseNumber}.pdf"`,
    },
  });
}
