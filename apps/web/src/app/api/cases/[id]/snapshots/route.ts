import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { captureCaseSnapshot, diffSnapshots } from "@/lib/snapshots";
import type { CaseSnapshotData } from "@/lib/snapshots";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("cases:read");
  if (error) return error;

  const { id } = await params;
  const caseData = await prisma.case.findUnique({ where: { id } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const snapshots = await prisma.investigationSnapshot.findMany({
    where: { caseId: id, userId: session!.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: { select: { name: true } } },
  });

  const current = await captureCaseSnapshot(id);
  const latest = snapshots[0];
  const diff = latest
    ? diffSnapshots(latest.snapshot as unknown as CaseSnapshotData, current)
    : [];

  return NextResponse.json({ snapshots, current, diffSinceLastSnapshot: diff });
}
