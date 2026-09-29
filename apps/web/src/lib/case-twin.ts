import { prisma } from "./db";
import { normalizeEntityValue } from "./normalize";

/**
 * Cross-case twin / MO similarity via shared entity values and crime-type affinity.
 * Inspired by serial-crime linkage analysis: overlapping phones, UPIs, vehicles, places
 * suggest investigative follow-up — not proof of common authorship.
 */

export interface CaseTwinOverlap {
  entityType: string;
  value: string;
  caseAEntityId: string;
  caseBEntityId: string;
}

export interface CaseTwinComparison {
  caseA: { id: string; caseNumber: string; crimeType: string };
  caseB: { id: string; caseNumber: string; crimeType: string };
  crimeTypeMatch: boolean;
  sharedEntities: CaseTwinOverlap[];
  overlapScore: number;
  summary: string;
  computedAt: string;
}

export interface SimilarCaseHit {
  caseId: string;
  caseNumber: string;
  crimeType: string;
  sharedCount: number;
  overlapScore: number;
  sharedValues: string[];
}

export interface SimilarCasesResult {
  seed: { id: string; caseNumber: string; crimeType: string };
  similar: SimilarCaseHit[];
  computedAt: string;
}

function normKey(type: string, value: string): string {
  return `${type}|${normalizeEntityValue(type, value)}`;
}

/**
 * Side-by-side twin compare by crimeType + shared normalized entity values.
 */
export async function compareCaseTwins(
  caseIdA: string,
  caseIdB: string
): Promise<CaseTwinComparison> {
  const [caseA, caseB, entsA, entsB] = await Promise.all([
    prisma.case.findUnique({
      where: { id: caseIdA },
      select: { id: true, caseNumber: true, crimeType: true },
    }),
    prisma.case.findUnique({
      where: { id: caseIdB },
      select: { id: true, caseNumber: true, crimeType: true },
    }),
    prisma.entity.findMany({
      where: { caseId: caseIdA, mergedIntoId: null },
      select: { id: true, type: true, normalizedValue: true },
    }),
    prisma.entity.findMany({
      where: { caseId: caseIdB, mergedIntoId: null },
      select: { id: true, type: true, normalizedValue: true },
    }),
  ]);

  if (!caseA || !caseB) {
    return {
      caseA: caseA ?? { id: caseIdA, caseNumber: "?", crimeType: "?" },
      caseB: caseB ?? { id: caseIdB, caseNumber: "?", crimeType: "?" },
      crimeTypeMatch: false,
      sharedEntities: [],
      overlapScore: 0,
      summary: "One or both cases not found",
      computedAt: new Date().toISOString(),
    };
  }

  const mapB = new Map<string, { id: string; type: string; value: string }>();
  for (const e of entsB) {
    mapB.set(normKey(e.type, e.normalizedValue), {
      id: e.id,
      type: e.type,
      value: e.normalizedValue,
    });
  }

  const sharedEntities: CaseTwinOverlap[] = [];
  for (const e of entsA) {
    const key = normKey(e.type, e.normalizedValue);
    const hit = mapB.get(key);
    if (hit) {
      sharedEntities.push({
        entityType: e.type,
        value: e.normalizedValue,
        caseAEntityId: e.id,
        caseBEntityId: hit.id,
      });
    }
  }

  const crimeTypeMatch =
    caseA.crimeType.toLowerCase().trim() === caseB.crimeType.toLowerCase().trim() ||
    caseA.crimeType.toLowerCase().includes(caseB.crimeType.toLowerCase()) ||
    caseB.crimeType.toLowerCase().includes(caseA.crimeType.toLowerCase());

  const unionSize = new Set([
    ...entsA.map((e) => normKey(e.type, e.normalizedValue)),
    ...entsB.map((e) => normKey(e.type, e.normalizedValue)),
  ]).size;
  const jaccard = unionSize > 0 ? sharedEntities.length / unionSize : 0;
  let overlapScore = Math.round(jaccard * 80);
  if (crimeTypeMatch) overlapScore += 20;
  overlapScore = Math.min(100, overlapScore);

  return {
    caseA,
    caseB,
    crimeTypeMatch,
    sharedEntities,
    overlapScore,
    summary: `${sharedEntities.length} shared entity value(s); crime types ${
      crimeTypeMatch ? "match" : "differ"
    }; overlap score ${overlapScore}/100`,
    computedAt: new Date().toISOString(),
  };
}

export async function findSimilarCases(
  caseId: string,
  limit = 10
): Promise<SimilarCasesResult> {
  const seed = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, caseNumber: true, crimeType: true },
  });

  if (!seed) {
    return {
      seed: { id: caseId, caseNumber: "?", crimeType: "?" },
      similar: [],
      computedAt: new Date().toISOString(),
    };
  }

  const seedEntities = await prisma.entity.findMany({
    where: { caseId, mergedIntoId: null },
    select: { type: true, normalizedValue: true },
  });
  const seedKeys = new Set(seedEntities.map((e) => normKey(e.type, e.normalizedValue)));
  const seedValues = seedEntities.map((e) => e.normalizedValue);

  // Candidate cases: same crime family or sharing entity values
  const sameCrime = await prisma.case.findMany({
    where: {
      id: { not: caseId },
      crimeType: { contains: seed.crimeType.split(/\s+/)[0] ?? seed.crimeType, mode: "insensitive" },
    },
    select: { id: true, caseNumber: true, crimeType: true },
    take: 50,
  });

  const valueMatches =
    seedValues.length > 0
      ? await prisma.entity.findMany({
          where: {
            caseId: { not: caseId },
            mergedIntoId: null,
            normalizedValue: { in: seedValues.slice(0, 200) },
          },
          select: {
            caseId: true,
            type: true,
            normalizedValue: true,
            case: { select: { caseNumber: true, crimeType: true } },
          },
          take: 500,
        })
      : [];

  const byCase = new Map<
    string,
    { caseNumber: string; crimeType: string; shared: Set<string> }
  >();

  for (const c of sameCrime) {
    byCase.set(c.id, { caseNumber: c.caseNumber, crimeType: c.crimeType, shared: new Set() });
  }
  for (const e of valueMatches) {
    const key = normKey(e.type, e.normalizedValue);
    if (!seedKeys.has(key)) continue;
    if (!byCase.has(e.caseId)) {
      byCase.set(e.caseId, {
        caseNumber: e.case.caseNumber,
        crimeType: e.case.crimeType,
        shared: new Set(),
      });
    }
    byCase.get(e.caseId)!.shared.add(`${e.type}:${e.normalizedValue}`);
  }

  // For same-crime cases with no shared values yet, compute overlap
  const needFull = [...byCase.entries()].filter(([, v]) => v.shared.size === 0).map(([id]) => id);
  if (needFull.length > 0) {
    const otherEnts = await prisma.entity.findMany({
      where: { caseId: { in: needFull.slice(0, 30) }, mergedIntoId: null },
      select: { caseId: true, type: true, normalizedValue: true },
    });
    for (const e of otherEnts) {
      const key = normKey(e.type, e.normalizedValue);
      if (seedKeys.has(key)) {
        byCase.get(e.caseId)?.shared.add(`${e.type}:${e.normalizedValue}`);
      }
    }
  }

  const similar: SimilarCaseHit[] = [...byCase.entries()]
    .map(([id, v]) => {
      const crimeTypeMatch =
        v.crimeType.toLowerCase().includes(seed.crimeType.toLowerCase()) ||
        seed.crimeType.toLowerCase().includes(v.crimeType.toLowerCase());
      const sharedCount = v.shared.size;
      let overlapScore = Math.min(80, sharedCount * 15);
      if (crimeTypeMatch) overlapScore += 20;
      return {
        caseId: id,
        caseNumber: v.caseNumber,
        crimeType: v.crimeType,
        sharedCount,
        overlapScore: Math.min(100, overlapScore),
        sharedValues: [...v.shared].slice(0, 15),
      };
    })
    .filter((h) => h.sharedCount > 0 || h.overlapScore >= 20)
    .sort((a, b) => b.overlapScore - a.overlapScore || b.sharedCount - a.sharedCount)
    .slice(0, limit);

  return {
    seed,
    similar,
    computedAt: new Date().toISOString(),
  };
}
