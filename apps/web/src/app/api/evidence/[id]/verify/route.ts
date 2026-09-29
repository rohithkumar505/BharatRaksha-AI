import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getEvidenceForUser } from "@/lib/evidence-access";
import { verifyEvidenceIntegrity, recordCustodyEvent } from "@/lib/blockchain";
import { prisma } from "@/lib/db";
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

  const result = await verifyEvidenceIntegrity(id);

  await recordCustodyEvent({
    evidenceId: id,
    event: "VERIFIED",
    userId: session!.user.id,
    hashAtEvent: result.currentHash,
    details: result.verified
      ? "INTEGRITY VERIFIED — file hash and ledger chain match"
      : "INTEGRITY MISMATCH — file or ledger chain tampered",
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
    payload: {
      verified: result.verified,
      fileVerified: result.fileVerified,
      chainVerified: result.chainVerified,
      currentHash: result.currentHash,
      storedHash: result.storedHash,
    },
  });

  await logAudit({
    userId: session!.user.id,
    action: "VERIFY_INTEGRITY",
    resource: "evidence",
    resourceId: id,
    details: result,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  if (!result.verified) {
    await prisma.alert.create({
      data: {
        type: "INTEGRITY_MISMATCH",
        title: "Evidence integrity mismatch",
        message: "File hash or blockchain ledger chain does not match. Evidence may have been tampered with.",
        confidence: 1.0,
        caseId: evidence.caseId,
        metadata: result,
      },
    });
  }

  return NextResponse.json({
    ...result,
    message: result.verified
      ? "INTEGRITY VERIFIED — evidence hash matches blockchain ledger"
      : "INTEGRITY MISMATCH — evidence file or custody chain may have been modified",
  });
}
