import { prisma } from "./db";
import type { Prisma } from "@bharat-raksha/database";

/**
 * Command-center AI digest — “what changed since last visit”.
 * Situation-awareness pattern: roll up new alerts by investigative feature
 * (conflicts, cyber, women-safety, MO/cross-case, etc.) for the officer’s
 * accessible cases. Leads only — not guilt findings.
 */

export type DigestBucketId =
  | "conflicts"
  | "cyber"
  | "women_safety"
  | "mo_cross"
  | "financial"
  | "cdr"
  | "other";

export interface DigestItem {
  id: string;
  title: string;
  message: string;
  type: string;
  confidence: number | null;
  createdAt: string;
  caseId: string;
  caseNumber: string;
  feature: string | null;
  bucket: DigestBucketId;
}

export interface DigestBucket {
  id: DigestBucketId;
  label: string;
  count: number;
  items: DigestItem[];
}

export interface AiDigestResult {
  since: string;
  generatedAt: string;
  totalNewAlerts: number;
  buckets: DigestBucket[];
  nextActions: string[];
  topCases: Array<{ caseId: string; caseNumber: string; alertCount: number }>;
}

const BUCKET_LABELS: Record<DigestBucketId, string> = {
  conflicts: "Evidence conflicts",
  cyber: "Cyber intel",
  women_safety: "Women safety",
  mo_cross: "MO / cross-case",
  financial: "Financial / AML",
  cdr: "CDR / communication",
  other: "Other alerts",
};

function classifyBucket(type: string, feature: string | null): DigestBucketId {
  const f = (feature ?? "").toUpperCase();
  const t = type.toUpperCase();
  if (f.includes("CONFLICT") || t.includes("CONFLICT") || t.includes("ALIBI")) return "conflicts";
  if (f.includes("CYBER") || t.includes("PHISH") || t.includes("SIM") || t.includes("MULE") || t.includes("CRYPTO"))
    return "cyber";
  if (f.includes("WOMEN") || t.includes("STALK") || t.includes("HARASS") || t.includes("TRAFFICK"))
    return "women_safety";
  if (f.includes("CROSS") || t.includes("CROSS") || t.includes("MATCH") || t.includes("MO")) return "mo_cross";
  if (t.includes("TXN") || t.includes("AML") || t.includes("FAN") || t.includes("LAYER") || t.includes("CIRCULAR"))
    return "financial";
  if (t.includes("CDR") || t.includes("BURST") || t.includes("COLOCAT") || t.includes("CALL")) return "cdr";
  return "other";
}

function featureFromMeta(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.feature === "string") return m.feature;
  return null;
}

export async function buildAiDigest(
  caseIds: string[],
  sinceIso: string
): Promise<AiDigestResult> {
  const since = new Date(sinceIso);
  const sinceSafe = Number.isNaN(since.getTime())
    ? new Date(Date.now() - 24 * 60 * 60 * 1000)
    : since;

  if (caseIds.length === 0) {
    return {
      since: sinceSafe.toISOString(),
      generatedAt: new Date().toISOString(),
      totalNewAlerts: 0,
      buckets: [],
      nextActions: ["Create a case and upload evidence to receive an AI digest."],
      topCases: [],
    };
  }

  const alerts = await prisma.alert.findMany({
    where: {
      caseId: { in: caseIds },
      createdAt: { gte: sinceSafe },
      status: { in: ["NEW", "ACKNOWLEDGED", "INVESTIGATING"] },
    } satisfies Prisma.AlertWhereInput,
    orderBy: { createdAt: "desc" },
    take: 80,
    include: { case: { select: { id: true, caseNumber: true } } },
  });

  const items: DigestItem[] = [];
  for (const a of alerts) {
    if (!a.caseId || !a.case) continue;
    const feature = featureFromMeta(a.metadata);
    items.push({
      id: a.id,
      title: a.title,
      message: a.message,
      type: a.type,
      confidence: a.confidence,
      createdAt: a.createdAt.toISOString(),
      caseId: a.caseId,
      caseNumber: a.case.caseNumber,
      feature,
      bucket: classifyBucket(a.type, feature),
    });
  }

  const byBucket = new Map<DigestBucketId, DigestItem[]>();
  for (const it of items) {
    const list = byBucket.get(it.bucket) ?? [];
    list.push(it);
    byBucket.set(it.bucket, list);
  }

  const order: DigestBucketId[] = [
    "conflicts",
    "cyber",
    "women_safety",
    "mo_cross",
    "financial",
    "cdr",
    "other",
  ];

  const buckets: DigestBucket[] = order
    .filter((id) => (byBucket.get(id)?.length ?? 0) > 0)
    .map((id) => ({
      id,
      label: BUCKET_LABELS[id],
      count: byBucket.get(id)!.length,
      items: byBucket.get(id)!.slice(0, 8),
    }));

  const caseCounts = new Map<string, { caseNumber: string; n: number }>();
  for (const it of items) {
    const cur = caseCounts.get(it.caseId) ?? { caseNumber: it.caseNumber, n: 0 };
    cur.n += 1;
    caseCounts.set(it.caseId, cur);
  }
  const topCases = [...caseCounts.entries()]
    .map(([caseId, v]) => ({ caseId, caseNumber: v.caseNumber, alertCount: v.n }))
    .sort((a, b) => b.alertCount - a.alertCount)
    .slice(0, 5);

  const nextActions: string[] = [];
  for (const b of buckets.slice(0, 4)) {
    nextActions.push(`Review ${b.count} new ${b.label.toLowerCase()} signal(s)`);
  }
  if (topCases[0]) {
    nextActions.push(`Prioritize case ${topCases[0].caseNumber} (${topCases[0].alertCount} new alerts)`);
  }
  if (nextActions.length === 0) {
    nextActions.push("No new intel since last visit — run Autopilot on active cases if evidence was uploaded.");
  }

  return {
    since: sinceSafe.toISOString(),
    generatedAt: new Date().toISOString(),
    totalNewAlerts: items.length,
    buckets,
    nextActions: nextActions.slice(0, 6),
    topCases,
  };
}
