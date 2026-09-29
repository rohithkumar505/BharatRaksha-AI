import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { LEGAL_DOCUMENT_TEMPLATES } from "@/lib/legal-automation";

export async function GET(
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

  const key = request.nextUrl.searchParams.get("key") ?? "fir_outline";
  const template = LEGAL_DOCUMENT_TEMPLATES[key];
  if (!template) {
    return NextResponse.json(
      { error: "Unknown template", available: Object.keys(LEGAL_DOCUMENT_TEMPLATES) },
      { status: 400 }
    );
  }

  return new NextResponse(template.content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${template.fileName}"`,
    },
  });
}
