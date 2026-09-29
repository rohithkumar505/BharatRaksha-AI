import { prisma } from "./db";

const MIRROR_TYPES = new Set(["PHONE", "UPI", "VEHICLE", "IP_ADDRESS", "DEVICE", "BANK_ACCOUNT", "EMAIL"]);

export interface MirrorIdentityRow {
  personId: string;
  personName: string;
  linked: Array<{
    entityId: string;
    type: string;
    value: string;
    relationType: string;
    confidence: number;
  }>;
  score: number;
  coverage: {
    phone: boolean;
    upi: boolean;
    vehicle: boolean;
    ip: boolean;
    device: boolean;
    bank: boolean;
    email: boolean;
  };
  reason: string;
}

export interface MirrorIdentityScoreboard {
  rows: MirrorIdentityRow[];
  summary: {
    personCount: number;
    fullyMirrored: number;
    avgScore: number;
  };
  computedAt: string;
}

/**
 * Cluster PERSON entities with linked PHONE/UPI/VEHICLE/IP/DEVICE (etc.) via relationships.
 * Supports identity resolution across digital “masks” — assistive scoreboard only.
 */
export async function buildMirrorIdentityScoreboard(
  caseId: string
): Promise<MirrorIdentityScoreboard> {
  const [persons, relationships] = await Promise.all([
    prisma.entity.findMany({
      where: { caseId, mergedIntoId: null, type: "PERSON" },
      select: { id: true, normalizedValue: true, confidence: true },
    }),
    prisma.relationship.findMany({
      where: {
        OR: [{ sourceEntity: { caseId } }, { targetEntity: { caseId } }],
      },
      select: {
        relationType: true,
        confidence: true,
        sourceEntityId: true,
        targetEntityId: true,
        sourceEntity: {
          select: { id: true, type: true, normalizedValue: true, caseId: true, mergedIntoId: true },
        },
        targetEntity: {
          select: { id: true, type: true, normalizedValue: true, caseId: true, mergedIntoId: true },
        },
      },
    }),
  ]);

  const rows: MirrorIdentityRow[] = [];

  for (const person of persons) {
    const linkedMap = new Map<
      string,
      {
        entityId: string;
        type: string;
        value: string;
        relationType: string;
        confidence: number;
      }
    >();

    for (const rel of relationships) {
      const src = rel.sourceEntity;
      const tgt = rel.targetEntity;
      if (src.mergedIntoId || tgt.mergedIntoId) continue;
      if (src.caseId !== caseId || tgt.caseId !== caseId) continue;

      let other = null as typeof src | null;
      if (src.id === person.id && MIRROR_TYPES.has(tgt.type)) other = tgt;
      else if (tgt.id === person.id && MIRROR_TYPES.has(src.type)) other = src;
      // Also one-hop: PERSON-PHONE already; if PERSON linked to PHONE and we only have that edge
      if (!other) continue;

      const key = other.id;
      const existing = linkedMap.get(key);
      if (!existing || rel.confidence > existing.confidence) {
        linkedMap.set(key, {
          entityId: other.id,
          type: other.type,
          value: other.normalizedValue,
          relationType: rel.relationType,
          confidence: rel.confidence,
        });
      }
    }

    // Indirect: person ↔ phone ↔ upi via phone intermediate
    const phoneIds = [...linkedMap.values()].filter((l) => l.type === "PHONE").map((l) => l.entityId);
    for (const rel of relationships) {
      const src = rel.sourceEntity;
      const tgt = rel.targetEntity;
      if (src.caseId !== caseId || tgt.caseId !== caseId) continue;
      const touchPhone =
        (phoneIds.includes(src.id) && MIRROR_TYPES.has(tgt.type) && tgt.type !== "PHONE") ||
        (phoneIds.includes(tgt.id) && MIRROR_TYPES.has(src.type) && src.type !== "PHONE");
      if (!touchPhone) continue;
      const other = phoneIds.includes(src.id) ? tgt : src;
      if (other.type === "PERSON" || other.id === person.id) continue;
      if (!MIRROR_TYPES.has(other.type)) continue;
      if (!linkedMap.has(other.id)) {
        linkedMap.set(other.id, {
          entityId: other.id,
          type: other.type,
          value: other.normalizedValue,
          relationType: `VIA_PHONE:${rel.relationType}`,
          confidence: rel.confidence * 0.85,
        });
      }
    }

    const linked = [...linkedMap.values()];
    const coverage = {
      phone: linked.some((l) => l.type === "PHONE"),
      upi: linked.some((l) => l.type === "UPI"),
      vehicle: linked.some((l) => l.type === "VEHICLE"),
      ip: linked.some((l) => l.type === "IP_ADDRESS"),
      device: linked.some((l) => l.type === "DEVICE"),
      bank: linked.some((l) => l.type === "BANK_ACCOUNT"),
      email: linked.some((l) => l.type === "EMAIL"),
    };
    const dims = Object.values(coverage).filter(Boolean).length;
    const score = Math.min(
      100,
      Math.round(dims * 14 + linked.length * 4 + person.confidence * 10)
    );

    rows.push({
      personId: person.id,
      personName: person.normalizedValue,
      linked,
      score,
      coverage,
      reason: `${person.normalizedValue}: ${linked.length} linked identifier(s) across ${dims} channel(s)`,
    });
  }

  rows.sort((a, b) => b.score - a.score);
  const avgScore =
    rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;

  return {
    rows,
    summary: {
      personCount: rows.length,
      fullyMirrored: rows.filter((r) => r.coverage.phone && (r.coverage.upi || r.coverage.bank)).length,
      avgScore,
    },
    computedAt: new Date().toISOString(),
  };
}
