import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { getCaseGraph, getGraphAnalytics } from "@/lib/neo4j-sync";
import { canAccessCase } from "@/lib/case-access";
import { auditAccess } from "@/lib/audit-access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("graph:read");
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
    action: "READ",
    resource: "graph",
    resourceId: id,
  });
  const { searchParams } = new URL(request.url);
  const hops = parseInt(searchParams.get("hops") ?? "2", 10);
  const analytics = searchParams.get("analytics") === "true";
  const centerNode = searchParams.get("centerNode") ?? undefined;
  const evolution = searchParams.get("evolution") === "true";
  const nodeLimit = parseInt(searchParams.get("nodeLimit") ?? "1000", 10);
  const nodeOffset = parseInt(searchParams.get("nodeOffset") ?? "0", 10);

  try {
    const graph = await getCaseGraph(id, hops, centerNode, {
      nodeLimit: Math.min(nodeLimit, 2000),
      nodeOffset,
    });
    const payload: Record<string, unknown> = { ...graph };
    if (analytics) {
      payload.analytics = await getGraphAnalytics(id);
    }
    if (evolution) {
      const { getNetworkEvolution } = await import("@/lib/neo4j-sync");
      payload.evolution = await getNetworkEvolution(id);
    }
    return NextResponse.json(payload);
  } catch (err) {
    console.error("Graph fetch error:", err);
    return NextResponse.json({ nodes: [], edges: [], error: "Graph unavailable" });
  }
}
