import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { auditAccess } from "@/lib/audit-access";
import { getMapData, geocodeCaseLocations, createGeoAlerts } from "@/lib/geo-intelligence";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("analytics:read");
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
    resource: "map-data",
    resourceId: id,
  });

  try {
    const mapData = await getMapData(id);
    return NextResponse.json(mapData);
  } catch (err) {
    console.error("Map data error:", err);
    return NextResponse.json({ error: "Map data failed" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("analytics:read");
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
    action: "ANALYZE",
    resource: "map-data",
    resourceId: id,
  });

  try {
    const geocoded = await geocodeCaseLocations(id);
    const alertsCreated = await createGeoAlerts(id);
    const mapData = await getMapData(id);
    return NextResponse.json({ geocoded, alertsCreated, mapData });
  } catch (err) {
    console.error("Geo analysis error:", err);
    return NextResponse.json({ error: "Geo analysis failed" }, { status: 500 });
  }
}
