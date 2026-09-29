import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import {
  buildCustodyReportHtml,
  buildVerifiableCustodyTimeline,
} from "@/lib/custody-verifiable";

export async function GET(
  request: NextRequest,
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

  const doc = await prisma.evidence.findFirst({ where: { id: evidenceId, caseId } });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const timeline = await buildVerifiableCustodyTimeline(evidenceId);
  if (!timeline) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const format = request.nextUrl.searchParams.get("format");
  if (format === "html" || format === "report") {
    const html = buildCustodyReportHtml(timeline);
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.json(timeline);
}
