import { prisma } from "./db";
import { withNeo4jSession } from "./neo4j";
import { syncEntityToNeo4j, syncRelationshipToNeo4j } from "./neo4j-sync";

/**
 * Full entity merge (Step 7): redirect relationships, merge raw values, update Neo4j.
 * canonicalId survives; mergedId is marked mergedIntoId.
 */
export async function mergeEntities(canonicalId: string, mergedId: string) {
  if (canonicalId === mergedId) return;

  const [canonical, merged] = await Promise.all([
    prisma.entity.findUnique({ where: { id: canonicalId } }),
    prisma.entity.findUnique({ where: { id: mergedId } }),
  ]);

  if (!canonical || !merged) throw new Error("Entity not found for merge");
  if (merged.mergedIntoId) throw new Error("Entity already merged");

  await prisma.$transaction(async (tx) => {
    const mergedRaw = [...new Set([...canonical.rawValues, ...merged.rawValues])];
    await tx.entity.update({
      where: { id: canonicalId },
      data: {
        rawValues: mergedRaw,
        confidence: Math.max(canonical.confidence, merged.confidence),
        metadata: {
          ...(canonical.metadata as object),
          mergedFrom: [...((canonical.metadata as { mergedFrom?: string[] })?.mergedFrom ?? []), mergedId],
        },
      },
    });

    await tx.entity.update({
      where: { id: mergedId },
      data: { mergedIntoId: canonicalId },
    });

    const outgoing = await tx.relationship.findMany({ where: { sourceEntityId: mergedId } });
    for (const rel of outgoing) {
      if (rel.targetEntityId === canonicalId) {
        await tx.relationship.delete({ where: { id: rel.id } });
        continue;
      }
      const dup = await tx.relationship.findFirst({
        where: {
          sourceEntityId: canonicalId,
          targetEntityId: rel.targetEntityId,
          relationType: rel.relationType,
        },
      });
      if (dup) {
        await tx.relationship.delete({ where: { id: rel.id } });
      } else {
        await tx.relationship.update({
          where: { id: rel.id },
          data: { sourceEntityId: canonicalId },
        });
      }
    }

    const incoming = await tx.relationship.findMany({ where: { targetEntityId: mergedId } });
    for (const rel of incoming) {
      if (rel.sourceEntityId === canonicalId) {
        await tx.relationship.delete({ where: { id: rel.id } });
        continue;
      }
      const dup = await tx.relationship.findFirst({
        where: {
          sourceEntityId: rel.sourceEntityId,
          targetEntityId: canonicalId,
          relationType: rel.relationType,
        },
      });
      if (dup) {
        await tx.relationship.delete({ where: { id: rel.id } });
      } else {
        await tx.relationship.update({
          where: { id: rel.id },
          data: { targetEntityId: canonicalId },
        });
      }
    }

    await tx.entityMatch.updateMany({
      where: { OR: [{ entityAId: mergedId }, { entityBId: mergedId }] },
      data: { status: "APPROVED" },
    });
  });

  await mergeEntityInNeo4j(canonicalId, mergedId);
  await syncEntityToNeo4j(canonicalId);

  const rels = await prisma.relationship.findMany({
    where: {
      OR: [{ sourceEntityId: canonicalId }, { targetEntityId: canonicalId }],
    },
  });
  for (const rel of rels) {
    await syncRelationshipToNeo4j(rel.id);
  }
}

async function mergeEntityInNeo4j(_canonicalId: string, mergedId: string) {
  await withNeo4jSession(async (session) => {
    await session.run(`MATCH (n) WHERE n.pgId = $mergedId DETACH DELETE n`, { mergedId });
  });
}
