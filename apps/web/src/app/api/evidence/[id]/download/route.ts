import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getEvidenceForUser } from "@/lib/evidence-access";
import { recordCustodyEvent } from "@/lib/blockchain";
import { downloadEvidenceFile } from "@/lib/s3";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("evidence:read");
  if (error) return error;

  const { id } = await params;
  const { evidence, forbidden } = await getEvidenceForUser(id, session!.user);

  if (forbidden) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!evidence) {
    return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format") ?? "file";

  await recordCustodyEvent({
    evidenceId: id,
    event: "EXPORTED",
    userId: session!.user.id,
    hashAtEvent: evidence.sha256Hash,
    details: `Evidence exported (${format}): ${evidence.fileName}`,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
    payload: { exportFormat: format, fileName: evidence.fileName },
  });

  await logAudit({
    userId: session!.user.id,
    action: "EXPORT_EVIDENCE",
    resource: "evidence",
    resourceId: id,
    details: { fileName: evidence.fileName, format },
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  if (format === "custody-bundle") {
    const { getEvidenceCustodyChain, verifyEvidenceIntegrity } = await import("@/lib/blockchain");
    const chain = await getEvidenceCustodyChain(id);
    const integrity = await verifyEvidenceIntegrity(id);

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      evidence: {
        id: evidence.id,
        fileName: evidence.fileName,
        sha256Hash: evidence.sha256Hash,
        blockchainTxId: evidence.blockchainTxId,
        caseNumber: evidence.case.caseNumber,
      },
      integrity,
      custodyChain: chain,
    });
  }

  const buffer = await downloadEvidenceFile(evidence.filePath);

  await recordCustodyEvent({
    evidenceId: id,
    event: "VIEWED",
    userId: session!.user.id,
    hashAtEvent: evidence.sha256Hash,
    details: `Evidence file downloaded: ${evidence.fileName}`,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
    payload: { action: "download" },
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": evidence.mimeType,
      "Content-Disposition": `attachment; filename="${evidence.fileName}"`,
      "X-Evidence-SHA256": evidence.sha256Hash,
      "X-Blockchain-Tx": evidence.blockchainTxId ?? "",
    },
  });
}
