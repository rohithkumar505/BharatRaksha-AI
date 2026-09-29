import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { buildDocumentRegister, ensureCaseRegisterNumbers, buildRegisterHtml } from "@/lib/legal-documents";

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

  await ensureCaseRegisterNumbers(caseId);
  const register = await buildDocumentRegister(caseId);

  const format = new URL(request.url).searchParams.get("format");
  if (format === "html") {
    const html = buildRegisterHtml(register);
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="legal-register-${register.case?.caseNumber ?? caseId}.html"`,
      },
    });
  }

  return NextResponse.json(register);
}
