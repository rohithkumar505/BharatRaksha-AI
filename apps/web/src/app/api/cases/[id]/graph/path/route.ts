import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { findShortestPath } from "@/lib/neo4j-sync";

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

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const target = searchParams.get("target");

  if (!source || !target) {
    return NextResponse.json({ error: "source and target required" }, { status: 400 });
  }

  try {
    const path = await findShortestPath(id, source, target);
    return NextResponse.json(path);
  } catch (err) {
    console.error("Path find error:", err);
    return NextResponse.json({ found: false, nodes: [], edges: [], hops: 0 });
  }
}
