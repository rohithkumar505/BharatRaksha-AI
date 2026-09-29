import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";
import { canAccessCase } from "@/lib/case-access";
import { updateCaseSchema } from "@/lib/validators";
import { captureCaseSnapshot, diffSnapshots, saveUserSnapshot } from "@/lib/snapshots";
import type { CaseSnapshotData } from "@/lib/snapshots";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("cases:read");
  if (error) return error;

  const { id } = await params;

  const caseData = await prisma.case.findUnique({
    where: { id },
    include: {
      investigatingOfficer: { select: { id: true, name: true, email: true } },
      evidence: {
        orderBy: { createdAt: "desc" },
        include: {
          uploadedBy: { select: { name: true } },
          ingestionJobs: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
      entities: { where: { mergedIntoId: null }, take: 50 },
      notes: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: {
          evidence: true,
          entities: true,
          cdrRecords: true,
          transactions: true,
          alerts: true,
        },
      },
    },
  });

  if (!caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lastSnapshot = await prisma.investigationSnapshot.findFirst({
    where: { caseId: id, userId: session!.user.id },
    orderBy: { createdAt: "desc" },
  });

  const currentSnapshot = await captureCaseSnapshot(id);
  const changesSinceLastVisit = lastSnapshot
    ? diffSnapshots(lastSnapshot.snapshot as unknown as CaseSnapshotData, currentSnapshot)
    : [];

  await saveUserSnapshot(id, session!.user.id);

  await logAudit({
    userId: session!.user.id,
    action: "READ",
    resource: "case",
    resourceId: id,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json({ ...caseData, changesSinceLastVisit, currentSnapshot });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("cases:update");
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.case.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  if (!canAccessCase(session!.user, existing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateCaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const isSeniorOrAdmin = ["SENIOR_OFFICER", "ADMIN"].includes(session!.user.role);
  if (data.investigatingOfficerId && !isSeniorOrAdmin && data.investigatingOfficerId !== session!.user.id) {
    return NextResponse.json({ error: "Only senior officers can reassign cases" }, { status: 403 });
  }
  if (data.status === "CLOSED" || data.status === "ARCHIVED") {
    if (!isSeniorOrAdmin && existing.investigatingOfficerId !== session!.user.id) {
      return NextResponse.json({ error: "Forbidden to close this case" }, { status: 403 });
    }
  }

  const updated = await prisma.case.update({
    where: { id },
    data: {
      ...(data.crimeType && { crimeType: data.crimeType }),
      ...(data.location !== undefined && { location: data.location }),
      ...(data.incidentDate !== undefined && {
        incidentDate: data.incidentDate ? new Date(data.incidentDate) : null,
      }),
      ...(data.priority && { priority: data.priority }),
      ...(data.status && { status: data.status }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.investigatingOfficerId !== undefined && {
        investigatingOfficerId: data.investigatingOfficerId,
      }),
      ...(data.policeStation !== undefined && { policeStation: data.policeStation }),
    },
    include: { investigatingOfficer: { select: { id: true, name: true } } },
  });

  await logAudit({
    userId: session!.user.id,
    action: "UPDATE",
    resource: "case",
    resourceId: id,
    details: data as Record<string, unknown>,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("cases:delete");
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.case.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  if (!canAccessCase(session!.user, existing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.case.delete({ where: { id } });

  await logAudit({
    userId: session!.user.id,
    action: "DELETE",
    resource: "case",
    resourceId: id,
    details: { caseNumber: existing.caseNumber },
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json({ success: true });
}
