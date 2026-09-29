import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { caseAccessFilter } from "@/lib/case-access";
import { assessPlatformReliabilityForLegal } from "@/lib/legal-automation-engine";
import { prisma } from "@/lib/db";

export async function GET() {
  const { error, session } = await requireAuth("reports:read");
  if (error) return error;

  const accessFilter = caseAccessFilter(session!.user);
  const sample = await prisma.evidence.findMany({
    where: { case: accessFilter },
    select: { filePath: true },
    take: 5,
    orderBy: { createdAt: "desc" },
  });

  const report = await assessPlatformReliabilityForLegal(sample.map((s) => s.filePath));
  return NextResponse.json(report);
}
