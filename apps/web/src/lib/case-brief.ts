import { prisma } from "./db";
import { computeInvestigationHealth } from "./investigation-health";
import { analyzeEvidenceConflicts } from "./conflict-radar";
import { getCluesAndHypotheses } from "./clue-hypothesis";
import { resolvePlaybook } from "./crime-playbooks";

export interface CaseBriefPoi {
  type: string;
  value: string;
  entityId: string;
  confidence: number;
}

export interface CaseBrief {
  caseNumber: string;
  crimeType: string;
  summary: string;
  /** Hindi assistive summary from the same facts (rule-based). */
  summaryHi: string;
  pois: CaseBriefPoi[];
  nextActions: string[];
  conflictsCount: number;
  healthScore: number;
  playbookId: string;
  alertHighlights: string[];
  generatedAt: string;
  source: "RULE" | "OPENAI";
}

async function optionalLlmPolish(draft: CaseBrief, facts: Record<string, unknown>): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.COPILOT_MODEL ?? "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are Bharat Raksha AI case brief writer for Indian law enforcement.
RULES:
- ONLY use provided facts. Never invent entities, amounts, or guilt.
- Write a concise English investigation summary (max 180 words).
- Use language: "investigative lead", "review recommended", "confidence".
- Never declare anyone a criminal.`,
          },
          {
            role: "user",
            content: `Draft summary: ${draft.summary}
Facts JSON: ${JSON.stringify(facts).slice(0, 7000)}
Return ONLY the improved summary paragraph.`,
          },
        ],
        max_tokens: 350,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim();
      return text || null;
    }
  } catch {
    // fall back to rule summary
  }
  return null;
}

/**
 * Structured English (+ Hindi assist) case brief from live case data.
 * Optional OpenAI polish for English summary only — never invents facts.
 */
export async function generateCaseBrief(caseId: string): Promise<CaseBrief> {
  const [caseRow, entities, alerts, health, conflicts, clues, counts] = await Promise.all([
    prisma.case.findUnique({
      where: { id: caseId },
      select: {
        caseNumber: true,
        crimeType: true,
        location: true,
        incidentDate: true,
        description: true,
        policeStation: true,
        status: true,
        priority: true,
      },
    }),
    prisma.entity.findMany({
      where: { caseId, mergedIntoId: null },
      orderBy: { confidence: "desc" },
      take: 30,
      select: { id: true, type: true, normalizedValue: true, confidence: true },
    }),
    prisma.alert.findMany({
      where: { caseId, status: { in: ["NEW", "ACKNOWLEDGED", "INVESTIGATING"] } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { type: true, title: true, confidence: true },
    }),
    computeInvestigationHealth(caseId),
    analyzeEvidenceConflicts(caseId),
    getCluesAndHypotheses(caseId),
    prisma.case.findUnique({
      where: { id: caseId },
      select: {
        _count: {
          select: {
            evidence: true,
            cdrRecords: true,
            transactions: true,
            locations: true,
            entities: true,
          },
        },
      },
    }),
  ]);

  const playbook = resolvePlaybook(caseRow?.crimeType ?? "");
  const c = counts?._count;

  const pois: CaseBriefPoi[] = entities
    .filter((e) =>
      ["PERSON", "PHONE", "UPI", "VEHICLE", "EMAIL", "DOMAIN", "CRYPTO_WALLET", "DEVICE"].includes(
        e.type
      )
    )
    .slice(0, 15)
    .map((e) => ({
      type: e.type,
      value: e.normalizedValue,
      entityId: e.id,
      confidence: e.confidence,
    }));

  const nextActions: string[] = [];
  for (const gap of health.gaps.slice(0, 6)) {
    nextActions.push(`Close gap: ${gap}`);
  }
  if (alerts.length > 0) {
    nextActions.push(`Triage ${alerts.length} open alert(s), starting with: ${alerts[0].title}`);
  }
  if (conflicts.conflicts.length > 0) {
    nextActions.push(`Resolve ${conflicts.conflicts.length} evidence conflict(s)`);
  }
  if (clues.hypotheses[0]) {
    nextActions.push(`Test hypothesis: ${clues.hypotheses[0].title}`);
  }
  if (nextActions.length === 0) {
    nextActions.push("Continue evidence collection and re-run Autopilot");
  }

  const summaryParts = [
    `Case ${caseRow?.caseNumber ?? caseId} (${caseRow?.crimeType ?? "unknown"}) is ${caseRow?.status ?? "OPEN"} / ${caseRow?.priority ?? "MEDIUM"}.`,
    caseRow?.incidentDate
      ? `Incident window anchored ${caseRow.incidentDate.toISOString().slice(0, 10)}.`
      : "Incident date not set.",
    caseRow?.location ? `Recorded location: ${caseRow.location}.` : null,
    caseRow?.policeStation ? `PS: ${caseRow.policeStation}.` : null,
    `Evidence inventory: ${c?.evidence ?? 0} file(s), ${c?.entities ?? 0} entities, ${c?.cdrRecords ?? 0} CDR, ${c?.transactions ?? 0} txn, ${c?.locations ?? 0} geo.`,
    caseRow?.description ? `Narrative: ${caseRow.description.slice(0, 220)}` : null,
    `Investigation health ${health.score}/100 (playbook ${playbook.id}).`,
    `${alerts.length} open alert(s); ${conflicts.conflicts.length} conflict(s) flagged.`,
    pois.length ? `Key POIs include ${pois.slice(0, 5).map((p) => `${p.type}:${p.value}`).join(", ")}.` : null,
  ].filter(Boolean);

  const summaryHiParts = [
    `केस ${caseRow?.caseNumber ?? caseId} (${caseRow?.crimeType ?? "अज्ञात"}) — स्थिति ${caseRow?.status ?? "OPEN"}, प्राथमिकता ${caseRow?.priority ?? "MEDIUM"}.`,
    caseRow?.location ? `स्थान: ${caseRow.location}.` : null,
    caseRow?.policeStation ? `थाना: ${caseRow.policeStation}.` : null,
    `साक्ष्य: ${c?.evidence ?? 0} फ़ाइल, ${c?.entities ?? 0} इकाई, ${c?.cdrRecords ?? 0} CDR, ${c?.transactions ?? 0} लेनदेन, ${c?.locations ?? 0} स्थान.`,
    `जाँच स्वास्थ्य ${health.score}/100 (प्लेबुक ${playbook.id}).`,
    `${alerts.length} खुले अलर्ट; ${conflicts.conflicts.length} विरोधाभास चिह्नित.`,
    pois.length
      ? `मुख्य POI: ${pois.slice(0, 5).map((p) => `${p.type}:${p.value}`).join(", ")}.`
      : null,
    "यह सहायक सारांश है — साक्ष्य की समीक्षा आवश्यक।",
  ].filter(Boolean);

  let brief: CaseBrief = {
    caseNumber: caseRow?.caseNumber ?? caseId,
    crimeType: caseRow?.crimeType ?? "Unknown",
    summary: summaryParts.join(" "),
    summaryHi: summaryHiParts.join(" "),
    pois,
    nextActions: nextActions.slice(0, 10),
    conflictsCount: conflicts.conflicts.length,
    healthScore: health.score,
    playbookId: playbook.id,
    alertHighlights: alerts.slice(0, 8).map((a) => `[${a.type}] ${a.title}`),
    generatedAt: new Date().toISOString(),
    source: "RULE",
  };

  const polished = await optionalLlmPolish(brief, {
    case: caseRow,
    counts: c,
    pois,
    alerts: brief.alertHighlights,
    gaps: health.gaps,
    conflicts: conflicts.conflicts.slice(0, 5).map((x) => x.title),
  });
  if (polished) {
    brief = { ...brief, summary: polished, source: "OPENAI" };
  }

  return brief;
}
