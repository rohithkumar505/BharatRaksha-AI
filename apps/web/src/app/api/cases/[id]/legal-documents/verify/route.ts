import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { ensureCaseRegisterNumbers, verifyCaseDocumentBundle } from "@/lib/legal-documents";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";

export async function POST(
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
  const result = await verifyCaseDocumentBundle(caseId);

  await logAudit({
    userId: session!.user.id,
    action: "LEGAL_BUNDLE_VERIFY",
    resource: "case",
    resourceId: caseId,
    details: { passed: result.passed, total: result.total, allVerified: result.allVerified },
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json(result);
}
