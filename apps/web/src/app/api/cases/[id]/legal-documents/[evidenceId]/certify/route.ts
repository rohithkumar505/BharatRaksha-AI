import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { certifyLegalDocument } from "@/lib/legal-documents";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";
import { z } from "zod";

const bodySchema = z.object({
  lane: z.enum(["IO", "PROSECUTION"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; evidenceId: string }> }
) {
  const { error, session } = await requireAuth("evidence:upload");
  if (error) return error;

  const { id: caseId, evidenceId } = await params;
  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const updated = await certifyLegalDocument({
      evidenceId,
      caseId,
      userId: session!.user.id,
      userRole: session!.user.role,
      lane: parsed.data.lane,
    });
    await logAudit({
      userId: session!.user.id,
      action: parsed.data.lane === "IO" ? "LEGAL_IO_CERTIFY" : "LEGAL_PROSECUTION_CERTIFY",
      resource: "evidence",
      resourceId: evidenceId,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });
    return NextResponse.json({ document: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Certify failed" },
      { status: 400 }
    );
  }
}
