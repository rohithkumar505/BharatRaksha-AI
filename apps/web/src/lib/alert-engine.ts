import { prisma } from "./db";
import { detectBridgeNodes } from "./graph-analytics";
import { createCdrAlerts } from "./cdr-intelligence";
import { createFinancialAlerts } from "./financial-intelligence";
import { createGeoAlerts } from "./geo-intelligence";
import { scanAndCreateCrossCaseAlerts } from "./graph-analytics";
import { publishAlertEvent } from "./alert-pubsub";

/** Run all alert detectors after evidence ingestion */
export async function runPostIngestionAlerts(caseId: string): Promise<{
  cdr: number;
  financial: number;
  geo: number;
  bridge: number;
  crossCase: number;
}> {
  // Sequential to avoid Neo4j GDS graph catalog races under concurrent detectors
  const cdr = await createCdrAlerts(caseId).catch(() => 0);
  const financial = await createFinancialAlerts(caseId).catch(() => 0);
  const geo = await createGeoAlerts(caseId).catch(() => 0);
  const bridge = await createBridgeAlerts(caseId).catch(() => 0);
  const crossCase = await scanAndCreateCrossCaseAlerts().catch(() => 0);

  return { cdr, financial, geo, bridge, crossCase };
}

export async function createBridgeAlerts(caseId: string): Promise<number> {
  const bridges = await detectBridgeNodes(caseId);
  let created = 0;

  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    select: { caseNumber: true },
  });

  for (const bridge of bridges.slice(0, 5)) {
    const entityExists = await prisma.entity.findUnique({
      where: { id: bridge.id },
      select: { id: true },
    });
    if (!entityExists) continue;

    const existing = await prisma.alert.findFirst({
      where: {
        caseId,
        type: "BRIDGE_NODE",
        entityId: bridge.id,
        status: { in: ["NEW", "ACKNOWLEDGED", "INVESTIGATING"] },
      },
    });
    if (existing) continue;

    const alert = await prisma.alert.create({
      data: {
        type: "BRIDGE_NODE",
        title: `Bridge node: ${bridge.label} ${bridge.value}`,
        message: bridge.reason,
        confidence: Math.min(bridge.betweenness / 100, 0.95),
        caseId,
        entityId: bridge.id,
        metadata: {
          betweenness: bridge.betweenness,
          connectsCommunities: bridge.connectsCommunities,
        },
      },
    });

    await publishAlertEvent({
      id: alert.id,
      type: alert.type,
      title: alert.title,
      message: alert.message,
      confidence: alert.confidence ?? undefined,
      caseId,
      caseNumber: caseData?.caseNumber,
      createdAt: alert.createdAt.toISOString(),
    });

    created++;
  }

  return created;
}

export async function notifyNewAlert(alertId: string): Promise<void> {
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    include: { case: { select: { caseNumber: true } } },
  });
  if (!alert) return;

  await publishAlertEvent({
    id: alert.id,
    type: alert.type,
    title: alert.title,
    message: alert.message,
    confidence: alert.confidence ?? undefined,
    caseId: alert.caseId ?? undefined,
    caseNumber: alert.case?.caseNumber,
    createdAt: alert.createdAt.toISOString(),
  });
}
