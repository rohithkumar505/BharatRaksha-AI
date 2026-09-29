import { prisma } from "./db";
import { decryptPii } from "./pii-crypto";
import { normalizePhone } from "./normalize";

export interface SilentActor {
  identifier: string;
  channel: "CDR" | "TRANSACTION" | "BOTH";
  beforeCount: number;
  afterCount: number;
  lastBefore: string | null;
  firstAfter: string | null;
  reason: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface SilenceDetectorResult {
  incidentAnchor: string;
  anchorSource: "INCIDENT_DATE" | "EARLIEST_EVIDENCE" | "EARLIEST_ACTIVITY";
  silentActors: SilentActor[];
  activeAfter: Array<{ identifier: string; afterCount: number }>;
  computedAt: string;
}

/**
 * Detect parties with activity before the crime window and none (or sharp drop) after.
 * Classic investigative pattern: sudden silence can mark awareness of police interest
 * or completed coordination — treat as a lead, not proof.
 */
export async function detectPostCrimeSilence(
  caseId: string
): Promise<SilenceDetectorResult> {
  const [caseRow, earliestEvidence, cdrRaw, txnsRaw] = await Promise.all([
    prisma.case.findUnique({
      where: { id: caseId },
      select: { incidentDate: true, createdAt: true },
    }),
    prisma.evidence.findFirst({
      where: { caseId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.cdrRecord.findMany({
      where: { caseId },
      select: { caller: true, receiver: true, timestamp: true },
      orderBy: { timestamp: "asc" },
    }),
    prisma.transaction.findMany({
      where: { caseId },
      select: { sender: true, receiver: true, timestamp: true },
      orderBy: { timestamp: "asc" },
    }),
  ]);

  const cdr = cdrRaw.map((r) => ({
    ...r,
    caller: decryptPii(r.caller),
    receiver: decryptPii(r.receiver),
  }));
  const txns = txnsRaw.map((t) => ({
    ...t,
    sender: decryptPii(t.sender),
    receiver: decryptPii(t.receiver),
  }));

  let anchor: Date;
  let anchorSource: SilenceDetectorResult["anchorSource"];

  if (caseRow?.incidentDate) {
    anchor = caseRow.incidentDate;
    anchorSource = "INCIDENT_DATE";
  } else if (earliestEvidence) {
    anchor = earliestEvidence.createdAt;
    anchorSource = "EARLIEST_EVIDENCE";
  } else {
    const firstCdr = cdr[0]?.timestamp;
    const firstTxn = txns[0]?.timestamp;
    const candidates = [firstCdr, firstTxn].filter(Boolean) as Date[];
    if (candidates.length === 0) {
      return {
        incidentAnchor: caseRow?.createdAt.toISOString() ?? new Date().toISOString(),
        anchorSource: "EARLIEST_ACTIVITY",
        silentActors: [],
        activeAfter: [],
        computedAt: new Date().toISOString(),
      };
    }
    anchor = new Date(Math.min(...candidates.map((d) => d.getTime())));
    // Midpoint of activity range as soft crime window if no incident date
    const lastCdr = cdr[cdr.length - 1]?.timestamp;
    const lastTxn = txns[txns.length - 1]?.timestamp;
    const lasts = [lastCdr, lastTxn].filter(Boolean) as Date[];
    if (lasts.length) {
      const last = new Date(Math.max(...lasts.map((d) => d.getTime())));
      const mid = new Date((anchor.getTime() + last.getTime()) / 2);
      anchor = mid;
    }
    anchorSource = "EARLIEST_ACTIVITY";
  }

  type Agg = { before: number; after: number; lastBefore: Date | null; firstAfter: Date | null };
  const cdrAgg = new Map<string, Agg>();
  const txnAgg = new Map<string, Agg>();

  function bump(map: Map<string, Agg>, id: string, ts: Date) {
    if (!map.has(id)) map.set(id, { before: 0, after: 0, lastBefore: null, firstAfter: null });
    const a = map.get(id)!;
    if (ts.getTime() < anchor.getTime()) {
      a.before++;
      if (!a.lastBefore || ts > a.lastBefore) a.lastBefore = ts;
    } else {
      a.after++;
      if (!a.firstAfter || ts < a.firstAfter) a.firstAfter = ts;
    }
  }

  for (const r of cdr) {
    bump(cdrAgg, normalizePhone(r.caller), r.timestamp);
    bump(cdrAgg, normalizePhone(r.receiver), r.timestamp);
  }
  for (const t of txns) {
    bump(txnAgg, t.sender, t.timestamp);
    bump(txnAgg, t.receiver, t.timestamp);
  }

  const allIds = new Set([...cdrAgg.keys(), ...txnAgg.keys()]);
  const silentActors: SilentActor[] = [];
  const activeAfter: Array<{ identifier: string; afterCount: number }> = [];

  for (const id of allIds) {
    const c = cdrAgg.get(id) ?? { before: 0, after: 0, lastBefore: null, firstAfter: null };
    const t = txnAgg.get(id) ?? { before: 0, after: 0, lastBefore: null, firstAfter: null };
    const before = c.before + t.before;
    const after = c.after + t.after;
    if (after > 0) {
      activeAfter.push({ identifier: id, afterCount: after });
    }
    if (before < 2) continue;
    if (after > 0 && after >= before * 0.3) continue; // not silent enough

    const channel: SilentActor["channel"] =
      c.before > 0 && t.before > 0 ? "BOTH" : c.before > 0 ? "CDR" : "TRANSACTION";

    let severity: SilentActor["severity"] = "LOW";
    if (after === 0 && before >= 10) severity = "CRITICAL";
    else if (after === 0 && before >= 5) severity = "HIGH";
    else if (after === 0 || after < before * 0.15) severity = "MEDIUM";

    const lastBefore =
      [c.lastBefore, t.lastBefore].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ??
      null;
    const firstAfter =
      [c.firstAfter, t.firstAfter].filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ??
      null;

    silentActors.push({
      identifier: id,
      channel,
      beforeCount: before,
      afterCount: after,
      lastBefore: lastBefore?.toISOString() ?? null,
      firstAfter: firstAfter?.toISOString() ?? null,
      reason:
        after === 0
          ? `${id} had ${before} activity event(s) before ${anchor.toISOString()} and none after (${channel}). Post-crime silence lead — review recommended.`
          : `${id} dropped from ${before} pre-window to ${after} post-window events (${channel}). Sharp activity drop — review recommended.`,
      severity,
    });
  }

  silentActors.sort((a, b) => {
    const sev = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    return sev[b.severity] - sev[a.severity] || b.beforeCount - a.beforeCount;
  });
  activeAfter.sort((a, b) => b.afterCount - a.afterCount);

  return {
    incidentAnchor: anchor.toISOString(),
    anchorSource,
    silentActors: silentActors.slice(0, 40),
    activeAfter: activeAfter.slice(0, 20),
    computedAt: new Date().toISOString(),
  };
}
