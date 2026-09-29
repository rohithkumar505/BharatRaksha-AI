import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { runLegalPlaybook, LEGAL_AUTOMATION_PLAYBOOKS } from "@/lib/legal-automation-engine";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";

export async function POST(
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

  const body = (await request.json().catch(() => ({}))) as { playbookId?: string };
  const playbookId = body.playbookId ?? "mha_one_click_court_file";
  const known = LEGAL_AUTOMATION_PLAYBOOKS.some((p) => p.id === playbookId && p.scope === "case");
  if (!known) {
    return NextResponse.json({ error: "Unknown case playbook" }, { status: 400 });
  }

  const result = await runLegalPlaybook({
    playbookId,
    caseId,
    userId: session!.user.id,
  });

  await logAudit({
    userId: session!.user.id,
    action: "LEGAL_AUTOMATION_PLAYBOOK",
    resource: "case",
    resourceId: caseId,
    details: { playbookId, runId: result.runId, status: result.status },
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json(result);
}
