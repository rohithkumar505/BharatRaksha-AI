import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { getLegalDocumentAuditTrail, getLegalDocumentDetail } from "@/lib/legal-documents";
import { recordCustodyEvent } from "@/lib/blockchain";
import { getClientIp, getUserAgent } from "@/lib/audit";

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

  const doc = await getLegalDocumentDetail(caseId, evidenceId);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await recordCustodyEvent({
    evidenceId: doc.id,
    event: "ACCESSED",
    userId: session!.user.id,
    details: "Legal document accessed (SIH26190 register)",
    hashAtEvent: doc.sha256Hash,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
    payload: { registerNumber: doc.registerNumber, legalCategory: doc.legalCategory },
  });

  const auditTrail = await getLegalDocumentAuditTrail(evidenceId);

  return NextResponse.json({ document: doc, auditTrail });
}
