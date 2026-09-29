import { prisma, EntityType, Prisma } from "./db";
import { nameSimilarity, normalizeEntityValue, phonesMatch, addressSimilarity } from "./normalize";
import { normalizeEntity } from "./ai-client";

export async function findAndCreateEntityMatches(caseId: string) {
  const entities = await prisma.entity.findMany({
    where: { caseId, mergedIntoId: null },
  });

  const matches: Array<{
    entityAId: string;
    entityBId: string;
    confidence: number;
    reasons: string[];
  }> = [];

  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];
      if (a.type !== b.type) continue;

      const reasons: string[] = [];
      let confidence = 0;

      if (a.type === "PHONE") {
        if (phonesMatch(a.normalizedValue, b.normalizedValue)) {
          confidence = 100;
          reasons.push("Exact phone match after normalization");
        }
      } else if (a.type === "PERSON") {
        const sim = nameSimilarity(a.normalizedValue, b.normalizedValue);
        if (sim >= 0.7) {
          confidence = Math.round(sim * 100);
          reasons.push(`Name similarity: ${Math.round(sim * 100)}%`);
        }
      } else if (a.type === "BANK_ACCOUNT") {
        const va = a.normalizedValue.replace(/\D/g, "");
        const vb = b.normalizedValue.replace(/\D/g, "");
        if (va === vb && va.length >= 9) {
          confidence = 98;
          reasons.push("Exact account number match");
        }
      } else if (a.type === "ADDRESS" || a.type === "LOCATION") {
        const sim = addressSimilarity(a.normalizedValue, b.normalizedValue);
        if (sim >= 0.65) {
          confidence = Math.round(sim * 100);
          reasons.push(`Address/location similarity: ${Math.round(sim * 100)}%`);
        }
      } else if (a.type === "EMAIL" || a.type === "UPI") {
        if (a.normalizedValue.toLowerCase() === b.normalizedValue.toLowerCase()) {
          confidence = 99;
          reasons.push("Exact email/UPI match");
        }
      } else if (a.type === "VEHICLE" || a.type === "IFSC" || a.type === "DEVICE") {
        if (a.normalizedValue === b.normalizedValue) {
          confidence = 97;
          reasons.push(`Exact ${a.type} match`);
        }
      } else if (a.normalizedValue === b.normalizedValue) {
        confidence = 95;
        reasons.push("Exact normalized value match");
      }

      if (confidence >= 70) {
        const [idA, idB] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
        const existing = await prisma.entityMatch.findUnique({
          where: { entityAId_entityBId: { entityAId: idA, entityBId: idB } },
        });
        if (!existing) {
          matches.push({ entityAId: idA, entityBId: idB, confidence, reasons });
        }
      }
    }
  }

  for (const match of matches) {
    await prisma.entityMatch.create({
      data: {
        entityAId: match.entityAId,
        entityBId: match.entityBId,
        confidence: match.confidence,
        reasons: match.reasons,
      },
    });

    const entityA = entities.find((e) => e.id === match.entityAId);
    await prisma.alert.create({
      data: {
        type: "ENTITY_MATCH",
        title: "Potential entity match detected",
        message: `Two ${entityA?.type} entities may represent the same real-world object (${match.confidence}% confidence). Review recommended.`,
        confidence: match.confidence / 100,
        caseId,
        entityId: match.entityAId,
        metadata: { entityAId: match.entityAId, entityBId: match.entityBId, reasons: match.reasons },
      },
    });
  }

  return matches.length;
}

export async function getOrCreateEntity(
  caseId: string,
  type: EntityType,
  value: string,
  evidenceId?: string,
  rawValues?: string[],
  confidence = 0.85
) {
  const normalizedResult = await normalizeEntity(type, value);
  const normalized = normalizedResult.normalized || normalizeEntityValue(type, value);

  const existing = await prisma.entity.findFirst({
    where: { caseId, type, normalizedValue: normalized, mergedIntoId: null },
  });

  if (existing) {
    if (rawValues?.length) {
      const merged = [...new Set([...existing.rawValues, ...rawValues])];
      await prisma.entity.update({
        where: { id: existing.id },
        data: { rawValues: merged, confidence: Math.max(existing.confidence, confidence) },
      });
    }
    return existing;
  }

  return prisma.entity.create({
    data: {
      caseId,
      type,
      normalizedValue: normalized,
      rawValues: rawValues ?? [value],
      evidenceId,
      confidence,
      metadata: (normalizedResult.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
