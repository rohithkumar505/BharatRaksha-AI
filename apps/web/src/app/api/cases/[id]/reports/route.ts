import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { auditAccess } from "@/lib/audit-access";
import { rateLimit } from "@/lib/rate-limit";
import { generateInvestigationReport, saveReport } from "@/lib/report-generator";
import { renderReportPdf } from "@/lib/pdf-report";
import { uploadEvidenceFile } from "@/lib/s3";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("reports:read");
  if (error) return error;

  const { id } = await params;
  const caseData = await prisma.case.findUnique({ where: { id } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reports = await prisma.report.findMany({
    where: { caseId: id },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ reports });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimited = await rateLimit(request, "reports", 10, 3600);
  if (rateLimited) return rateLimited;

  const { error, session } = await requireAuth("reports:generate");
  if (error) return error;

  const { id } = await params;
  const caseData = await prisma.case.findUnique({ where: { id } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await auditAccess(request, {
    userId: session!.user.id,
    action: "GENERATE",
    resource: "report",
    resourceId: id,
  });

  try {
    const report = await generateInvestigationReport(id, session!.user.id);
    const pdfBuffer = await renderReportPdf(report);

    const fileKey = `${id}/reports/report-${caseData.caseNumber}-${Date.now()}.pdf`;
    const { path } = await uploadEvidenceFile(fileKey, pdfBuffer, "application/pdf");

    const saved = await saveReport(id, session!.user.id, report, path);

    return NextResponse.json({
      report: saved,
      summary: report.summary,
      sectionCount: report.sections.length,
      pdfPath: path,
    });
  } catch (err) {
    console.error("Report generation error:", err);
    return NextResponse.json({ error: "Report generation failed" }, { status: 500 });
  }
}
