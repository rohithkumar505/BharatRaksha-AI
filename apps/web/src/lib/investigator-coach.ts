/**
 * Investigator Coach — junior-friendly “why / next step / avoid” cards
 * grounded only in clues, hypotheses, and health gaps (assistive, not orders).
 *
 * Informed by common investigative training practice: explain the signal,
 * recommend a verifiable next action, warn against over-conclusion.
 */
import { getCluesAndHypotheses } from "./clue-hypothesis";
import { computeInvestigationHealth } from "./investigation-health";

export interface CoachCard {
  id: string;
  title: string;
  why: string;
  nextStep: string;
  avoid: string;
  confidence: number;
  relatedClueIds: string[];
}

export interface CoachResult {
  cards: CoachCard[];
  healthScore: number;
  playbookId: string;
  computedAt: string;
}

export async function getInvestigatorCoach(caseId: string): Promise<CoachResult> {
  const [{ clues, hypotheses }, health] = await Promise.all([
    getCluesAndHypotheses(caseId),
    computeInvestigationHealth(caseId),
  ]);

  const cards: CoachCard[] = [];

  for (const h of hypotheses.slice(0, 6)) {
    cards.push({
      id: `coach-hyp:${h.id}`,
      title: h.title,
      why: h.theory,
      nextStep:
        "Verify supporting clues against primary evidence timestamps and record findings in case notes before acting.",
      avoid: h.caveats[0] ?? "Do not treat AI hypothesis as proof of guilt.",
      confidence: h.confidence,
      relatedClueIds: h.supportingClueIds,
    });
  }

  for (const c of clues.filter((x) => x.source === "ALERT").slice(0, 8)) {
    cards.push({
      id: `coach-alert:${c.id}`,
      title: c.title,
      why: c.reason,
      nextStep: c.entityId
        ? "Open the linked entity on the Network tab and expand 2-hop neighbors; note any cross-case reuse."
        : "Open Alerts, mark Investigating, and attach the related evidence file in notes.",
      avoid: "Do not dismiss high-confidence alerts without documenting a reason.",
      confidence: c.confidence,
      relatedClueIds: [c.id],
    });
  }

  for (const gap of health.gaps.slice(0, 6)) {
    cards.push({
      id: `coach-gap:${Buffer.from(gap).toString("base64url").slice(0, 20)}`,
      title: `Close gap: ${gap}`,
      why: `Investigation health is ${health.score}/100 under playbook ${health.playbookLabel}. Missing this reduces completeness.`,
      nextStep: /CDR|communication/i.test(gap)
        ? "Upload or re-ingest CDR CSV, then Run Autopilot or Re-analyze Communication."
        : /match/i.test(gap)
          ? "Open Matches and approve/reject pending entity merges."
          : /incident date|location|description/i.test(gap)
            ? "Update case Overview fields (date/location/description) via workflow panel."
            : "Upload the missing evidence type for this playbook, then Run Autopilot.",
      avoid: "Do not close the case while critical playbook modules remain empty.",
      confidence: 0.7,
      relatedClueIds: clues.filter((x) => x.source === "HEALTH_GAP").slice(0, 2).map((x) => x.id),
    });
  }

  cards.sort((a, b) => b.confidence - a.confidence);

  return {
    cards: cards.slice(0, 20),
    healthScore: health.score,
    playbookId: health.playbookId,
    computedAt: new Date().toISOString(),
  };
}
