import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { buildBsaSection63Certificate } from "@/lib/legal-documents";
import { verifyEvidenceIntegrity } from "@/lib/blockchain";
import { recordCustodyEvent } from "@/lib/blockchain";
import { getClientIp, getUserAgent } from "@/lib/audit";

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
  });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const integrity = await verifyEvidenceIntegrity(doc.id);
  await recordCustodyEvent({
    evidenceId: doc.id,
    event: "VERIFIED",
    userId: session!.user.id,
    hashAtEvent: integrity.currentHash,
    details: "BSA Section 63 certificate generated",
    ipAddress: getClientIp(_request),
    userAgent: getUserAgent(_request),
    payload: { certificate: true },
  });

  const certificate = buildBsaSection63Certificate({
    id: doc.id,
    fileName: doc.fileName,
    sha256Hash: doc.sha256Hash,
    registerNumber: doc.registerNumber,
    exhibitLabel: doc.exhibitLabel,
    caseNumber: caseData.caseNumber,
    verified: integrity.verified,
    chainMessage: integrity.chainMessage,
    certifiedAt: new Date().toISOString(),
    officerName: session!.user.name ?? session!.user.email,
  });

  return NextResponse.json(certificate);
}
