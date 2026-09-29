import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { getNodeDetail } from "@/lib/neo4j-sync";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; nodeId: string }> }
) {
  const { error, session } = await requireAuth("graph:read");
  if (error) return error;

  const { id, nodeId } = await params;
  const caseData = await prisma.case.findUnique({ where: { id } });
  if (!caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const detail = await getNodeDetail(nodeId);
    if (!detail) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    console.error("Node detail error:", err);
    return NextResponse.json({ error: "Failed to load node" }, { status: 500 });
  }
}
