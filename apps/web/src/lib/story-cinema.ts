import { prisma } from "./db";
import { decryptPii } from "./pii-crypto";
import { detectBursts } from "./cdr-intelligence";
import type { CdrRecord } from "@bharat-raksha/database";

/**
 * Evidence story cinema — chronological narrative beats from case meta, alerts,
 * CDR bursts, transactions, and geo events. Presentation aid for briefings;
 * every beat cites live stored evidence (not dramatized fiction).
 */

export interface StoryBeat {
  id: string;
  order: number;
  timestamp: string | null;
  kind: "CASE_META" | "ALERT" | "CDR_BURST" | "TRANSACTION" | "LOCATION" | "EVIDENCE";
  title: string;
  narrative: string;
  refs: Record<string, unknown>;
}

export interface StoryCinemaResult {
  caseNumber: string;
  title: string;
  beats: StoryBeat[];
  durationHintSec: number;
  computedAt: string;
}

/**
 * Ordered cinematic beats from case meta, alerts, CDR bursts, transactions, locations.
 */
export async function buildStoryCinema(caseId: string): Promise<StoryCinemaResult> {
  const [caseRow, alerts, cdrRaw, txnsRaw, locations, evidence] = await Promise.all([
    prisma.case.findUnique({
      where: { id: caseId },
      select: {
        caseNumber: true,
        crimeType: true,
        location: true,
        incidentDate: true,
        description: true,
        policeStation: true,
        createdAt: true,
      },
    }),
    prisma.alert.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
      take: 25,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        confidence: true,
        createdAt: true,
      },
    }),
    prisma.cdrRecord.findMany({
      where: { caseId },
      orderBy: { timestamp: "asc" },
      take: 2000,
    }),
    prisma.transaction.findMany({
      where: { caseId },
      orderBy: { timestamp: "asc" },
      take: 200,
      select: {
        id: true,
        sender: true,
        receiver: true,
        amount: true,
        timestamp: true,
        currency: true,
      },
    }),
    prisma.locationEvent.findMany({
      where: { caseId },
      orderBy: { timestamp: "asc" },
      take: 100,
      select: {
        id: true,
        entityRef: true,
        address: true,
        towerId: true,
        timestamp: true,
        latitude: true,
        longitude: true,
      },
    }),
    prisma.evidence.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, fileName: true, createdAt: true, sha256Hash: true },
    }),
  ]);

  const beats: StoryBeat[] = [];
  let order = 0;

  if (caseRow) {
    beats.push({
      id: `meta-open`,
      order: order++,
      timestamp: caseRow.incidentDate?.toISOString() ?? caseRow.createdAt.toISOString(),
      kind: "CASE_META",
      title: `Case ${caseRow.caseNumber}`,
      narrative: `${caseRow.crimeType}${caseRow.location ? ` at ${caseRow.location}` : ""}${
        caseRow.policeStation ? ` · ${caseRow.policeStation}` : ""
      }. ${caseRow.description ? caseRow.description.slice(0, 280) : "No description on file."}`,
      refs: { caseNumber: caseRow.caseNumber, crimeType: caseRow.crimeType },
    });
  }

  for (const ev of evidence.slice(0, 8)) {
    beats.push({
      id: `ev-${ev.id}`,
      order: order++,
      timestamp: ev.createdAt.toISOString(),
      kind: "EVIDENCE",
      title: `Evidence: ${ev.type}`,
      narrative: `Uploaded ${ev.fileName} (SHA-256 ${String(ev.sha256Hash ?? "").slice(0, 12)}…).`,
      refs: { evidenceId: ev.id, type: ev.type, sha256Hash: ev.sha256Hash },
    });
  }

  const cdr: CdrRecord[] = cdrRaw.map((r) => ({
    ...r,
    caller: decryptPii(r.caller),
    receiver: decryptPii(r.receiver),
  }));

  let bursts: ReturnType<typeof detectBursts> = [];
  try {
    bursts = detectBursts(cdr);
  } catch {
    bursts = [];
  }

  for (const b of bursts.slice(0, 8)) {
    beats.push({
      id: `burst-${b.phone}-${b.windowStart}`,
      order: order++,
      timestamp: b.windowStart,
      kind: "CDR_BURST",
      title: `Communication burst · ${b.phone}`,
      narrative: b.reason,
      refs: {
        phone: b.phone,
        callCount: b.callCount,
        severity: b.severity,
        involvedParties: b.involvedParties,
      },
    });
  }

  // Sample high-value or evenly spaced transactions
  const txns = txnsRaw.map((t) => ({
    ...t,
    sender: decryptPii(t.sender),
    receiver: decryptPii(t.receiver),
    amount: Number(t.amount),
  }));
  const txnPicks = [
    ...txns.filter((t) => t.amount >= 50_000).slice(0, 5),
    ...txns.filter((t) => t.amount < 50_000).filter((_, i) => i % Math.max(1, Math.floor(txns.length / 5)) === 0).slice(0, 5),
  ];
  const seenTxn = new Set<string>();
  for (const t of txnPicks) {
    if (seenTxn.has(t.id)) continue;
    seenTxn.add(t.id);
    beats.push({
      id: `txn-${t.id}`,
      order: order++,
      timestamp: t.timestamp.toISOString(),
      kind: "TRANSACTION",
      title: `Transfer ₹${t.amount.toLocaleString("en-IN")}`,
      narrative: `${t.sender} → ${t.receiver} (${t.currency}).`,
      refs: { transactionId: t.id, amount: t.amount },
    });
  }

  for (const l of locations.slice(0, 12)) {
    beats.push({
      id: `loc-${l.id}`,
      order: order++,
      timestamp: l.timestamp.toISOString(),
      kind: "LOCATION",
      title: `Location · ${l.entityRef ?? "unknown"}`,
      narrative: `${l.address ?? l.towerId ?? "coordinates"}${
        l.latitude != null ? ` (${l.latitude.toFixed(4)}, ${l.longitude?.toFixed(4)})` : ""
      }`,
      refs: {
        locationEventId: l.id,
        entityRef: l.entityRef,
        towerId: l.towerId,
      },
    });
  }

  for (const a of alerts) {
    beats.push({
      id: `alert-${a.id}`,
      order: order++,
      timestamp: a.createdAt.toISOString(),
      kind: "ALERT",
      title: a.title,
      narrative: a.message.slice(0, 300),
      refs: { alertId: a.id, type: a.type, confidence: a.confidence },
    });
  }

  // Chronological sort with meta open first
  const meta = beats.filter((b) => b.kind === "CASE_META");
  const rest = beats
    .filter((b) => b.kind !== "CASE_META")
    .sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    });
  const ordered = [...meta, ...rest].map((b, i) => ({ ...b, order: i }));

  return {
    caseNumber: caseRow?.caseNumber ?? caseId,
    title: `Story · ${caseRow?.caseNumber ?? caseId} · ${caseRow?.crimeType ?? "Investigation"}`,
    beats: ordered,
    durationHintSec: Math.max(30, ordered.length * 8),
    computedAt: new Date().toISOString(),
  };
}
