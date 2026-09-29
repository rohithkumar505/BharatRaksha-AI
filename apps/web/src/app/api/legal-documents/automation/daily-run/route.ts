import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { caseAccessFilter } from "@/lib/case-access";
import { runLegalPlaybook } from "@/lib/legal-automation-engine";
import { prisma } from "@/lib/db";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth("reports:generate");
  if (error) return error;

  const accessFilter = caseAccessFilter(session!.user);
  const cases = await prisma.case.findMany({ where: accessFilter, select: { id: true } });
  const caseIds = cases.map((c) => c.id);

  const result = await runLegalPlaybook({
    playbookId: "org_daily_compliance",
    caseIds,
    userId: session!.user.id,
  });

  await logAudit({
    userId: session!.user.id,
    action: "LEGAL_AUTOMATION_DAILY_RUN",
    resource: "legal_automation",
    details: { runId: result.runId, status: result.status, caseCount: caseIds.length },
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json(result);
}
