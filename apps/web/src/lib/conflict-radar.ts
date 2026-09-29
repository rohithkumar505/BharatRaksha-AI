import { prisma } from "./db";
import { decryptPii } from "./pii-crypto";
import { normalizeAddress, normalizeDate } from "./normalize";
import { createHash } from "crypto";

/**
 * Conflict / witness-consistency radar — FIR/notes narrative dates & places
 * vs digital timeline (CDR towers, bank txs, geo). Flags alibi / reporting
 * contradictions as investigative leads (not courtroom conclusions).
 */

export type ConflictSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface EvidenceConflict {
  id: string;
  title: string;
  severity: ConflictSeverity;
  confidence: number;
  reason: string;
  evidenceIds: string[];
  kind: "DATE" | "LOCATION" | "ALIBI" | "INTEGRITY";
}

export interface ConflictRadarResult {
  conflicts: EvidenceConflict[];
  summary: {
    total: number;
    bySeverity: Record<ConflictSeverity, number>;
  };
  computedAt: string;
}

const FEATURE = "EVIDENCE_CONFLICT";

function conflictId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

function extractDatesFromText(text: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g,
    /\b(\d{4})-(\d{2})-(\d{2})\b/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.add(normalizeDate(m[0]));
    }
  }
  return [...out];
}

function extractLocationHints(text: string): string[] {
  const hints: string[] = [];
  const locRe =
    /\b(?:at|near|in|from|towards)\s+([A-Z][A-Za-z0-9\s\-']{2,40})/g;
  let m: RegExpExecArray | null;
  while ((m = locRe.exec(text)) !== null) {
    hints.push(normalizeAddress(m[1]));
  }
  return hints;
}

function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function severityForGapHours(hours: number): ConflictSeverity {
  if (hours >= 72) return "CRITICAL";
  if (hours >= 24) return "HIGH";
  if (hours >= 6) return "MEDIUM";
  return "LOW";
}

/**
 * Compare FIR-ish narrative (description + notes + DATE/LOCATION entities)
 * against CDR timestamps, transactions, and locationEvents.
 */
export async function analyzeEvidenceConflicts(
  caseId: string
): Promise<ConflictRadarResult> {
  const [caseRow, notes, entities, cdrRaw, txnsRaw, locations, evidence] =
    await Promise.all([
      prisma.case.findUnique({
        where: { id: caseId },
        select: {
          description: true,
          location: true,
          incidentDate: true,
        },
      }),
      prisma.caseNote.findMany({
        where: { caseId },
        select: { id: true, content: true },
      }),
      prisma.entity.findMany({
        where: {
          caseId,
          mergedIntoId: null,
          type: { in: ["DATE", "LOCATION", "ADDRESS"] },
        },
        select: { id: true, type: true, normalizedValue: true, evidenceId: true },
      }),
      prisma.cdrRecord.findMany({
        where: { caseId },
        orderBy: { timestamp: "asc" },
        select: {
          id: true,
          caller: true,
          receiver: true,
          timestamp: true,
          location: true,
          towerId: true,
          evidenceId: true,
        },
      }),
      prisma.transaction.findMany({
        where: { caseId },
        orderBy: { timestamp: "asc" },
        select: { id: true, timestamp: true, evidenceId: true },
      }),
      prisma.locationEvent.findMany({
        where: { caseId },
        orderBy: { timestamp: "asc" },
        select: {
          id: true,
          timestamp: true,
          address: true,
          towerId: true,
          entityRef: true,
          latitude: true,
          longitude: true,
        },
      }),
      prisma.evidence.findMany({
        where: { caseId, type: "FIR" },
        select: { id: true, fileName: true },
      }),
    ]);

  const conflicts: EvidenceConflict[] = [];
  const firEvidenceIds = evidence.map((e) => e.id);

  const narrativeParts = [
    caseRow?.description ?? "",
    ...notes.map((n) => n.content),
  ].filter(Boolean);
  const narrative = narrativeParts.join("\n");

  const claimedDates = new Set<string>();
  if (caseRow?.incidentDate) claimedDates.add(dayOf(caseRow.incidentDate));
  for (const d of extractDatesFromText(narrative)) claimedDates.add(d);
  for (const e of entities.filter((x) => x.type === "DATE")) {
    claimedDates.add(normalizeDate(e.normalizedValue));
  }

  const claimedLocations = new Set<string>();
  if (caseRow?.location) claimedLocations.add(normalizeAddress(caseRow.location));
  for (const h of extractLocationHints(narrative)) claimedLocations.add(h);
  for (const e of entities.filter((x) => x.type === "LOCATION" || x.type === "ADDRESS")) {
    claimedLocations.add(normalizeAddress(e.normalizedValue));
  }

  const cdr = cdrRaw.map((r) => ({
    ...r,
    caller: decryptPii(r.caller),
    receiver: decryptPii(r.receiver),
  }));
  const txns = txnsRaw;

  // DATE conflicts: claimed incident day has no digital activity, or activity far from claim
  if (claimedDates.size > 0 && (cdr.length > 0 || txns.length > 0 || locations.length > 0)) {
    const digitalDays = new Set<string>();
    for (const r of cdr) digitalDays.add(dayOf(r.timestamp));
    for (const t of txns) digitalDays.add(dayOf(t.timestamp));
    for (const l of locations) digitalDays.add(dayOf(l.timestamp));

    for (const claimed of claimedDates) {
      if (!digitalDays.has(claimed)) {
        const nearest = [...digitalDays]
          .map((d) => ({
            d,
            hours: Math.abs(new Date(d).getTime() - new Date(claimed).getTime()) / 3_600_000,
          }))
          .sort((a, b) => a.hours - b.hours)[0];

        if (nearest && nearest.hours >= 6) {
          const evidIds = [
            ...firEvidenceIds,
            ...entities.filter((e) => e.type === "DATE").map((e) => e.evidenceId).filter(Boolean),
            ...cdr.slice(0, 3).map((r) => r.evidenceId).filter(Boolean),
            ...txns.slice(0, 3).map((t) => t.evidenceId).filter(Boolean),
          ] as string[];

          conflicts.push({
            id: conflictId(["date", claimed, nearest.d]),
            title: `Date mismatch: FIR/notes claim ${claimed}`,
            severity: severityForGapHours(nearest.hours),
            confidence: Math.min(0.55 + nearest.hours / 100, 0.92),
            reason: `Narrative/entity date ${claimed} has no CDR/transaction/location activity that day. Nearest digital activity is ${nearest.d} (~${Math.round(nearest.hours)}h apart). Review recommended.`,
            evidenceIds: [...new Set(evidIds)],
            kind: "DATE",
          });
        } else if (!nearest) {
          conflicts.push({
            id: conflictId(["date-none", claimed]),
            title: `Claimed date ${claimed} with no digital footprint`,
            severity: "MEDIUM",
            confidence: 0.6,
            reason: `FIR/notes reference ${claimed} but no CDR, transaction, or location events exist for this case yet.`,
            evidenceIds: [...firEvidenceIds],
            kind: "DATE",
          });
        }
      }
    }
  }

  // LOCATION conflicts: claimed place vs CDR towers / locationEvents
  if (claimedLocations.size > 0) {
    const digitalLocs = new Set<string>();
    for (const r of cdr) {
      if (r.towerId) digitalLocs.add(normalizeAddress(r.towerId));
      if (r.location) digitalLocs.add(normalizeAddress(r.location));
    }
    for (const l of locations) {
      if (l.address) digitalLocs.add(normalizeAddress(l.address));
      if (l.towerId) digitalLocs.add(normalizeAddress(l.towerId));
    }

    for (const claimed of claimedLocations) {
      if (digitalLocs.size === 0) continue;
      const overlap = [...digitalLocs].some(
        (d) => d.includes(claimed) || claimed.includes(d) || tokenOverlap(claimed, d) >= 0.5
      );
      if (!overlap) {
        const sample = [...digitalLocs].slice(0, 3).join("; ");
        conflicts.push({
          id: conflictId(["loc", claimed, sample]),
          title: `Location mismatch: claimed "${claimed}"`,
          severity: "HIGH",
          confidence: 0.72,
          reason: `Narrative/entity location "${claimed}" does not overlap with CDR towers/geo events (e.g. ${sample || "none"}). Possible alibi or reporting conflict — review recommended.`,
          evidenceIds: [
            ...firEvidenceIds,
            ...entities
              .filter((e) => e.type === "LOCATION" || e.type === "ADDRESS")
              .map((e) => e.evidenceId)
              .filter(Boolean),
            ...cdr.filter((r) => r.evidenceId).slice(0, 5).map((r) => r.evidenceId!),
          ] as string[],
          kind: "LOCATION",
        });
      }
    }
  }

  // Incident-window alibi: activity at distant tower on incident day while FIR claims another place
  if (caseRow?.incidentDate && caseRow.location && cdr.length > 0) {
    const incidentDay = dayOf(caseRow.incidentDate);
    const firLoc = normalizeAddress(caseRow.location);
    const sameDayCalls = cdr.filter((r) => dayOf(r.timestamp) === incidentDay);
    const distant = sameDayCalls.filter((r) => {
      const tower = normalizeAddress(r.towerId ?? r.location ?? "");
      if (!tower) return false;
      return !(tower.includes(firLoc) || firLoc.includes(tower) || tokenOverlap(tower, firLoc) >= 0.4);
    });
    if (distant.length >= 3) {
      conflicts.push({
        id: conflictId(["alibi", incidentDay, firLoc]),
        title: `Possible alibi conflict on ${incidentDay}`,
        severity: "CRITICAL",
        confidence: Math.min(0.65 + distant.length / 20, 0.9),
        reason: `${distant.length} CDR records on incident day map to towers/locations inconsistent with case location "${caseRow.location}". Review recommended.`,
        evidenceIds: [
          ...firEvidenceIds,
          ...distant.map((d) => d.evidenceId).filter(Boolean),
        ] as string[],
        kind: "ALIBI",
      });
    }
  }

  // Integrity: failed evidence ingestion vs references in notes
  const failedEvidence = await prisma.evidence.findMany({
    where: { caseId, ingestionStatus: "FAILED" },
    select: { id: true, fileName: true, ingestionError: true },
  });
  for (const fe of failedEvidence) {
    conflicts.push({
      id: conflictId(["integrity", fe.id]),
      title: `Evidence integrity issue: ${fe.fileName}`,
      severity: "HIGH",
      confidence: 0.95,
      reason: `Evidence "${fe.fileName}" failed ingestion${fe.ingestionError ? `: ${fe.ingestionError.slice(0, 160)}` : ""}. Digital timeline may be incomplete.`,
      evidenceIds: [fe.id],
      kind: "INTEGRITY",
    });
  }

  const bySeverity: Record<ConflictSeverity, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  for (const c of conflicts) bySeverity[c.severity]++;

  return {
    conflicts: conflicts.sort((a, b) => b.confidence - a.confidence),
    summary: { total: conflicts.length, bySeverity },
    computedAt: new Date().toISOString(),
  };
}

function tokenOverlap(a: string, b: string): number {
  const ta = a.split(/\s+/).filter((t) => t.length > 2);
  const tb = b.split(/\s+/).filter((t) => t.length > 2);
  if (ta.length === 0 || tb.length === 0) return 0;
  const common = ta.filter((t) => tb.includes(t));
  return common.length / Math.max(ta.length, tb.length);
}

/** Persist conflicts as COMMON_LOCATION or INTEGRITY_MISMATCH alerts. */
export async function createConflictAlerts(caseId: string): Promise<number> {
  const { conflicts } = await analyzeEvidenceConflicts(caseId);
  let created = 0;

  for (const c of conflicts.slice(0, 20)) {
    const type =
      c.kind === "INTEGRITY" || c.kind === "DATE" || c.kind === "ALIBI"
        ? ("INTEGRITY_MISMATCH" as const)
        : ("COMMON_LOCATION" as const);

    const existing = await prisma.alert.findFirst({
      where: {
        caseId,
        type,
        title: c.title,
        status: { in: ["NEW", "ACKNOWLEDGED", "INVESTIGATING"] },
      },
    });
    if (existing) continue;

    await prisma.alert.create({
      data: {
        type,
        title: c.title,
        message: c.reason,
        confidence: c.confidence,
        caseId,
        metadata: {
          feature: FEATURE,
          conflictId: c.id,
          kind: c.kind,
          severity: c.severity,
          evidenceIds: c.evidenceIds,
        },
      },
    });
    created++;
  }

  return created;
}
