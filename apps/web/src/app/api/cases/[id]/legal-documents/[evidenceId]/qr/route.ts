import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { buildPublicVerifyPath } from "@/lib/legal-documents";

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

  const doc = await prisma.evidence.findFirst({
    where: { id: evidenceId, caseId },
    select: { registerNumber: true, sha256Hash: true, fileName: true },
  });
  if (!doc?.registerNumber) {
    return NextResponse.json({ error: "Document needs register number" }, { status: 400 });
  }

  const base =
    process.env.NEXTAUTH_URL ??
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const verifyUrl = buildPublicVerifyPath(doc.registerNumber, doc.sha256Hash, base);
  const dataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 256 });

  return NextResponse.json({
    verifyUrl,
    qrDataUrl: dataUrl,
    label: "SIH26190 Nazarat QR — scan to verify integrity",
    registerNumber: doc.registerNumber,
    fileName: doc.fileName,
  });
}
