import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { getEdgeProvenance } from "@/lib/neo4j-sync";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; edgeId: string }> }
) {
  const { error, session } = await requireAuth("graph:read");
  if (error) return error;

  const { id, edgeId } = await params;
  const caseData = await prisma.case.findUnique({ where: { id } });
  if (!caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const provenance = await getEdgeProvenance(edgeId);
    if (!provenance) {
      return NextResponse.json({ error: "Edge not found" }, { status: 404 });
    }
    return NextResponse.json(provenance);
  } catch (err) {
    console.error("Edge provenance error:", err);
    return NextResponse.json({ error: "Failed to load provenance" }, { status: 500 });
  }
}
