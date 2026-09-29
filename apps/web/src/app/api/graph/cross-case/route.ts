import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { auditAccess } from "@/lib/audit-access";
import { findCrossCaseLinks, scanAndCreateCrossCaseAlerts } from "@/lib/graph-analytics";

export async function GET(request: NextRequest) {
  const { error, session } = await requireAuth("cross-case:read");
  if (error) return error;

  await auditAccess(request, {
    userId: session!.user.id,
    action: "READ",
    resource: "cross_case_links",
  });

  try {
    const links = await findCrossCaseLinks();
    return NextResponse.json({ links, count: links.length });
  } catch (err) {
    console.error("Cross-case error:", err);
    return NextResponse.json({ links: [], count: 0 });
  }
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth("cross-case:read");
  if (error) return error;

  await auditAccess(request, {
    userId: session!.user.id,
    action: "SCAN",
    resource: "cross_case_links",
  });

  try {
    const alertsCreated = await scanAndCreateCrossCaseAlerts();
    const links = await findCrossCaseLinks();
    return NextResponse.json({ alertsCreated, links, count: links.length });
  } catch (err) {
    console.error("Cross-case scan error:", err);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
