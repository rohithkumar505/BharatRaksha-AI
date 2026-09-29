import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { auditAccess } from "@/lib/audit-access";
import { indexCaseKnowledge } from "@/lib/copilot-rag";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("copilot:use");
  if (error) return error;

  const { id } = await params;
  const caseData = await prisma.case.findUnique({ where: { id } });
  if (!caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [chunkCount, recentQueries] = await Promise.all([
    prisma.caseKnowledgeChunk.count({ where: { caseId: id } }),
    prisma.copilotQueryLog.findMany({
      where: { caseId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, query: true, intent: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    caseId: id,
    indexed: chunkCount > 0,
    chunkCount,
    recentQueries,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("copilot:use");
  if (error) return error;

  const { id } = await params;
  const caseData = await prisma.case.findUnique({ where: { id } });
  if (!caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await auditAccess(request, {
    userId: session!.user.id,
    action: "INDEX",
    resource: "copilot",
    resourceId: id,
  });

  try {
    const chunksIndexed = await indexCaseKnowledge(id);
    return NextResponse.json({ chunksIndexed, caseId: id });
  } catch (err) {
    console.error("Copilot index error:", err);
    return NextResponse.json({ error: "Indexing failed" }, { status: 500 });
  }
}
