import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { caseAccessFilter } from "@/lib/case-access";
import { aggregateLegalDocumentStats } from "@/lib/legal-documents";

export async function GET(_request: NextRequest) {
  const { error, session } = await requireAuth("reports:read");
  if (error) return error;

  const accessFilter = caseAccessFilter(session!.user);
  const cases = await prisma.case.findMany({ where: accessFilter, select: { id: true } });
  const caseIds = cases.map((c) => c.id);
  const stats = await aggregateLegalDocumentStats(caseIds);

  return NextResponse.json({
    psAlignment: "SIH26190",
    stats,
  });
}
