import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("entities:read");
  if (error) return error;

  const { id: caseId } = await params;
  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const type = request.nextUrl.searchParams.get("type");

  const entities = await prisma.entity.findMany({
    where: {
      caseId,
      mergedIntoId: null,
      ...(type ? { type: type as never } : {}),
    },
    include: {
      evidence: { select: { id: true, fileName: true, type: true } },
    },
    orderBy: [{ type: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  const byType = entities.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({ entities, total: entities.length, byType });
}
