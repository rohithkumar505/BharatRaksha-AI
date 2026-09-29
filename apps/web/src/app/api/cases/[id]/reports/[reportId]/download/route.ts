import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { auditAccess } from "@/lib/audit-access";
import { downloadEvidenceFile } from "@/lib/s3";
import { renderReportPdf } from "@/lib/pdf-report";
import type { InvestigationReport } from "@/lib/report-generator";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  const { error, session } = await requireAuth("reports:read");
  if (error) return error;

  const { id, reportId } = await params;
  const caseData = await prisma.case.findUnique({ where: { id } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const report = await prisma.report.findFirst({
    where: { id: reportId, caseId: id },
  });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  await auditAccess(request, {
    userId: session!.user.id,
    action: "DOWNLOAD",
    resource: "report",
    resourceId: reportId,
  });

  try {
    let pdfBuffer: Buffer;
    if (report.pdfPath) {
      pdfBuffer = await downloadEvidenceFile(report.pdfPath);
    } else {
      pdfBuffer = await renderReportPdf(report.content as unknown as InvestigationReport);
    }

    const filename = `BharatRaksha-${caseData.caseNumber}-Report.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    console.error("Report download error:", err);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
