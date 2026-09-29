import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { caseAccessFilter } from "@/lib/case-access";
import { buildLegalCommandCenterMetrics, runRetentionComplianceScan } from "@/lib/legal-automation";
import { prisma } from "@/lib/db";

export async function GET(_request: NextRequest) {
  const { error, session } = await requireAuth("reports:read");
  if (error) return error;

  const accessFilter = caseAccessFilter(session!.user);
  const cases = await prisma.case.findMany({ where: accessFilter, select: { id: true } });
  const caseIds = cases.map((c) => c.id);
  const metrics = await buildLegalCommandCenterMetrics(caseIds);
  return NextResponse.json(metrics);
}

export async function POST(_request: NextRequest) {
  const { error, session } = await requireAuth("reports:generate");
  if (error) return error;

  const accessFilter = caseAccessFilter(session!.user);
  const cases = await prisma.case.findMany({ where: accessFilter, select: { id: true } });
  const caseIds = cases.map((c) => c.id);
  const scan = await runRetentionComplianceScan(caseIds);
  return NextResponse.json({ psAlignment: "SIH26190", ...scan });
}
