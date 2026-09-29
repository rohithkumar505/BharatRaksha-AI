import { prisma } from "./db";
import { computeInvestigationHealth } from "./investigation-health";

export interface ClueItem {
  id: string;
  title: string;
  reason: string;
  confidence: number;
  source: "ALERT" | "ENTITY" | "HEALTH_GAP" | "EVIDENCE";
  evidenceIds: string[];
  alertId?: string;
  entityId?: string;
}

export interface HypothesisItem {
  id: string;
  title: string;
  theory: string;
  confidence: number;
  supportingClueIds: string[];
  caveats: string[];
}

export interface CluesAndHypothesesResult {
  clues: ClueItem[];
  hypotheses: HypothesisItem[];
  computedAt: string;
}

/**
 * Ranked clues and alternate hypotheses grounded ONLY in alerts, entities, and health gaps.
 * Does not invent facts.
 */
export async function getCluesAndHypotheses(
  caseId: string
): Promise<CluesAndHypothesesResult> {
  const [alerts, entities, health, evidence] = await Promise.all([
    prisma.alert.findMany({
      where: {
        caseId,
        status: { in: ["NEW", "ACKNOWLEDGED", "INVESTIGATING"] },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        confidence: true,
        entityId: true,
        metadata: true,
      },
    }),
    prisma.entity.findMany({
      where: { caseId, mergedIntoId: null },
      orderBy: { confidence: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        normalizedValue: true,
        confidence: true,
        evidenceId: true,
      },
    }),
    computeInvestigationHealth(caseId),
    prisma.evidence.findMany({
      where: { caseId },
      select: { id: true, type: true, fileName: true, ingestionStatus: true },
    }),
  ]);

  const clues: ClueItem[] = [];

  for (const a of alerts) {
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    const evidenceIds = Array.isArray(meta.evidenceIds)
      ? (meta.evidenceIds as string[]).filter((x) => typeof x === "string")
      : [];
    clues.push({
      id: `alert:${a.id}`,
      title: a.title,
      reason: a.message,
      confidence: a.confidence ?? 0.6,
      source: "ALERT",
      evidenceIds,
      alertId: a.id,
      entityId: a.entityId ?? undefined,
    });
  }

  // High-signal entity types as clues
  const priorityTypes = new Set([
    "PHONE",
    "UPI",
    "VEHICLE",
    "CRYPTO_WALLET",
    "IP_ADDRESS",
    "DEVICE",
    "EMAIL",
    "DOMAIN",
  ]);
  for (const e of entities.filter((x) => priorityTypes.has(x.type)).slice(0, 20)) {
    clues.push({
      id: `entity:${e.id}`,
      title: `${e.type}: ${e.normalizedValue}`,
      reason: `Extracted ${e.type} entity with confidence ${Math.round(e.confidence * 100)}%. Verify linkage and provenance.`,
      confidence: Math.min(e.confidence, 0.85),
      source: "ENTITY",
      evidenceIds: e.evidenceId ? [e.evidenceId] : [],
      entityId: e.id,
    });
  }

  for (const gap of health.gaps.slice(0, 12)) {
    clues.push({
      id: `gap:${Buffer.from(gap).toString("base64url").slice(0, 24)}`,
      title: `Investigation gap: ${gap}`,
      reason: `Health meter gap (score ${health.score}/100, playbook ${health.playbookId}): ${gap}`,
      confidence: 0.5,
      source: "HEALTH_GAP",
      evidenceIds: [],
    });
  }

  for (const ev of evidence.filter((e) => e.ingestionStatus === "FAILED")) {
    clues.push({
      id: `evidence:${ev.id}`,
      title: `Failed evidence: ${ev.fileName}`,
      reason: `Evidence type ${ev.type} failed ingestion; related digital leads may be incomplete.`,
      confidence: 0.8,
      source: "EVIDENCE",
      evidenceIds: [ev.id],
    });
  }

  clues.sort((a, b) => b.confidence - a.confidence);

  const hypotheses: HypothesisItem[] = [];

  const burstAlerts = alerts.filter((a) => a.type === "COMMUNICATION_BURST");
  const txnAlerts = alerts.filter((a) => a.type === "TRANSACTION_ANOMALY");
  const locAlerts = alerts.filter((a) => a.type === "COMMON_LOCATION");
  const conflictAlerts = alerts.filter(
    (a) =>
      a.type === "INTEGRITY_MISMATCH" ||
      ((a.metadata as Record<string, unknown> | null)?.feature === "EVIDENCE_CONFLICT")
  );
  const crossCase = alerts.filter((a) => a.type === "CROSS_CASE_LINK" || a.type === "ENTITY_MATCH");

  if (burstAlerts.length && txnAlerts.length) {
    const support = [
      ...burstAlerts.slice(0, 2).map((a) => `alert:${a.id}`),
      ...txnAlerts.slice(0, 2).map((a) => `alert:${a.id}`),
    ];
    hypotheses.push({
      id: "hyp:cdr-fin-coordination",
      title: "Communication–finance coordination lead",
      theory:
        "CDR bursts co-occur with transaction anomalies; possible coordinated contact and fund movement. Review timing overlap.",
      confidence: Math.min(0.55 + (burstAlerts.length + txnAlerts.length) * 0.05, 0.85),
      supportingClueIds: support,
      caveats: ["Correlation is not guilt", "Requires timestamp alignment verification"],
    });
  }

  if (conflictAlerts.length) {
    hypotheses.push({
      id: "hyp:narrative-digital-conflict",
      title: "Narrative vs digital timeline conflict",
      theory:
        "FIR/notes/location claims conflict with CDR, transactions, or geo events. Possible misreporting, alibi issue, or incomplete evidence.",
      confidence: Math.min(0.5 + conflictAlerts.length * 0.08, 0.88),
      supportingClueIds: conflictAlerts.slice(0, 4).map((a) => `alert:${a.id}`),
      caveats: ["Conflicts may stem from timezone or missing uploads"],
    });
  }

  if (locAlerts.length && entities.some((e) => e.type === "PERSON")) {
    hypotheses.push({
      id: "hyp:colocation-meeting",
      title: "Co-location / meeting lead",
      theory:
        "Common-location alerts with person entities suggest possible physical rendezvous points for follow-up tower/geo verification.",
      confidence: 0.62,
      supportingClueIds: [
        ...locAlerts.slice(0, 2).map((a) => `alert:${a.id}`),
        ...entities
          .filter((e) => e.type === "PERSON")
          .slice(0, 2)
          .map((e) => `entity:${e.id}`),
      ],
      caveats: ["Tower resolution may be coarse"],
    });
  }

  if (crossCase.length) {
    hypotheses.push({
      id: "hyp:cross-case-network",
      title: "Cross-case identity network",
      theory:
        "Entity matches / cross-case links indicate shared identifiers across investigations. Consider joint review.",
      confidence: Math.min(0.6 + crossCase.length * 0.05, 0.9),
      supportingClueIds: crossCase.slice(0, 4).map((a) => `alert:${a.id}`),
      caveats: ["Pending match review may change confidence"],
    });
  }

  if (health.gaps.some((g) => /CDR|communication/i.test(g)) && evidence.some((e) => e.type === "CDR")) {
    hypotheses.push({
      id: "hyp:cdr-incomplete",
      title: "CDR coverage incomplete",
      theory: "CDR evidence exists but health gaps remain — re-ingest or expand number range may be needed.",
      confidence: 0.55,
      supportingClueIds: clues.filter((c) => c.source === "HEALTH_GAP").slice(0, 3).map((c) => c.id),
      caveats: ["Gap detection is module-based, not legal conclusion"],
    });
  }

  // Only keep hypotheses with at least one supporting clue that exists
  const clueIds = new Set(clues.map((c) => c.id));
  const grounded = hypotheses
    .map((h) => ({
      ...h,
      supportingClueIds: h.supportingClueIds.filter((id) => clueIds.has(id)),
    }))
    .filter((h) => h.supportingClueIds.length > 0)
    .sort((a, b) => b.confidence - a.confidence);

  return {
    clues: clues.slice(0, 50),
    hypotheses: grounded.slice(0, 10),
    computedAt: new Date().toISOString(),
  };
}
