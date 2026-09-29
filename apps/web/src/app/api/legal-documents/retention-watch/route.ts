import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { caseAccessFilter } from "@/lib/case-access";
import { listRetentionWatch } from "@/lib/legal-documents";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { error, session } = await requireAuth("reports:read");
  if (error) return error;

  const days = Math.min(Number(request.nextUrl.searchParams.get("days") ?? 30), 365);
  const accessFilter = caseAccessFilter(session!.user);
  const cases = await prisma.case.findMany({ where: accessFilter, select: { id: true } });
  const caseIds = cases.map((c) => c.id);
  const items = await listRetentionWatch(caseIds, days);

  return NextResponse.json({
    psAlignment: "SIH26190",
    withinDays: days,
    count: items.length,
    items: items.map((i) => ({
      id: i.id,
      fileName: i.fileName,
      registerNumber: i.registerNumber,
      retentionUntil: i.retentionUntil?.toISOString(),
      caseId: i.case.id,
      caseNumber: i.case.caseNumber,
    })),
  });
}
