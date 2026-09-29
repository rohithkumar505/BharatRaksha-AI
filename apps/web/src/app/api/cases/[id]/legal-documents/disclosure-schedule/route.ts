import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { buildDisclosureSchedule, buildDisclosureScheduleHtml } from "@/lib/legal-documents";

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

  const schedule = await buildDisclosureSchedule(caseId);
  if (new URL(request.url).searchParams.get("format") === "html") {
    const html = buildDisclosureScheduleHtml(schedule);
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return NextResponse.json(schedule);
}
