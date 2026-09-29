import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { auditAccess } from "@/lib/audit-access";
import { rateLimit } from "@/lib/rate-limit";
import { queryCopilot } from "@/lib/copilot-rag";
import { tryRunCopilotAgent } from "@/lib/copilot-agent";

export async function POST(request: NextRequest) {
  const rateLimited = await rateLimit(request, "copilot", 30, 60);
  if (rateLimited) return rateLimited;

  const { error, session } = await requireAuth("copilot:use");
  if (error) return error;

  const body = await request.json();
  const { query, caseId } = body;
  if (!query || !caseId) {
    return NextResponse.json({ error: "query and caseId required" }, { status: 400 });
  }

  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await auditAccess(request, {
    userId: session!.user.id,
    action: "QUERY",
    resource: "copilot",
    resourceId: caseId,
    details: { query: String(query).slice(0, 200) },
  });

  try {
    // Additive agent tools first; existing RAG path unchanged as fallback
    const agent = await tryRunCopilotAgent(caseId, String(query));
    if (agent.handled) {
      return NextResponse.json({
        answer: agent.answer,
        intent: agent.tool ?? "agent_tool",
        sources: [],
        chunks: [],
        tool: agent.tool,
        data: agent.data ?? null,
        caseId,
        computedAt: new Date().toISOString(),
      });
    }

    const result = await queryCopilot(caseId, String(query), session!.user.id);
    return NextResponse.json({
      answer: result.answer,
      intent: result.intent,
      sources: result.sources,
      chunks: result.chunks.map((c) => ({
        id: c.id,
        content: c.content,
        chunkType: c.chunkType,
        score: c.score,
      })),
      caseId,
      computedAt: result.computedAt,
    });
  } catch (err) {
    console.error("Copilot query error:", err);
    return NextResponse.json({ error: "Copilot query failed" }, { status: 500 });
  }
}
