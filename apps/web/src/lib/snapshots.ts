import { prisma } from "./db";
import { Prisma } from "@bharat-raksha/database";

export interface CaseSnapshotData {
  evidenceCount: number;
  entityCount: number;
  cdrCount: number;
  transactionCount: number;
  alertCount: number;
  relationshipCount: number;
  entityTypes: Record<string, number>;
  capturedAt: string;
}

export async function captureCaseSnapshot(caseId: string): Promise<CaseSnapshotData> {
  const [evidenceCount, entityCount, cdrCount, transactionCount, alertCount, relationshipCount, entities] =
    await Promise.all([
      prisma.evidence.count({ where: { caseId } }),
      prisma.entity.count({ where: { caseId, mergedIntoId: null } }),
      prisma.cdrRecord.count({ where: { caseId } }),
      prisma.transaction.count({ where: { caseId } }),
      prisma.alert.count({ where: { caseId } }),
      prisma.relationship.count({
        where: { sourceEntity: { caseId } },
      }),
      prisma.entity.groupBy({
        by: ["type"],
        where: { caseId, mergedIntoId: null },
        _count: true,
      }),
    ]);

  const entityTypes: Record<string, number> = {};
  for (const e of entities) {
    entityTypes[e.type] = e._count;
  }

  return {
    evidenceCount,
    entityCount,
    cdrCount,
    transactionCount,
    alertCount,
    relationshipCount,
    entityTypes,
    capturedAt: new Date().toISOString(),
  };
}

export async function saveUserSnapshot(caseId: string, userId: string) {
  const snapshot = await captureCaseSnapshot(caseId);
  return prisma.investigationSnapshot.create({
    data: { caseId, userId, snapshot: snapshot as unknown as Prisma.InputJsonValue },
  });
}

export function diffSnapshots(
  previous: CaseSnapshotData,
  current: CaseSnapshotData
): Array<{ field: string; before: number; after: number; delta: number }> {
  const fields = [
    "evidenceCount",
    "entityCount",
    "cdrCount",
    "transactionCount",
    "alertCount",
    "relationshipCount",
  ] as const;

  const diffs: Array<{ field: string; before: number; after: number; delta: number }> = fields
    .map((field) => ({
      field,
      before: previous[field],
      after: current[field],
      delta: current[field] - previous[field],
    }))
    .filter((d) => d.delta !== 0);

  const allTypes = new Set([
    ...Object.keys(previous.entityTypes),
    ...Object.keys(current.entityTypes),
  ]);
  for (const type of allTypes) {
    const before = previous.entityTypes[type] ?? 0;
    const after = current.entityTypes[type] ?? 0;
    if (before !== after) {
      diffs.push({
        field: `entity:${type}`,
        before,
        after,
        delta: after - before,
      });
    }
  }

  return diffs;
}
