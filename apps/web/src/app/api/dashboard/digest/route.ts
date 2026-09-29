import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { auditAccess } from "@/lib/audit-access";
import { caseAccessFilter } from "@/lib/case-access";
import { buildAiDigest } from "@/lib/ai-digest";

/** Additive Command Center digest — does not change /api/dashboard shape. */
export async function GET(request: NextRequest) {
  const { error, session } = await requireAuth("cases:read");
  if (error) return error;

  await auditAccess(request, {
    userId: session!.user.id,
    action: "READ",
    resource: "dashboard-digest",
  });

  const sinceParam = new URL(request.url).searchParams.get("since");
  const since =
    sinceParam || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const cases = await prisma.case.findMany({
    where: caseAccessFilter(session!.user),
    select: { id: true },
  });

  const digest = await buildAiDigest(
    cases.map((c) => c.id),
    since
  );

  return NextResponse.json(digest);
}
