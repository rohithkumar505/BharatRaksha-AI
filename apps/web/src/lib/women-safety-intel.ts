import { prisma } from "./db";
import { decryptPii } from "./pii-crypto";
import { normalizePhone } from "./normalize";

export interface StalkingSignal {
  caller: string;
  targetHint: string | null;
  callCount: number;
  nightCallCount: number;
  uniqueDays: number;
  reason: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface EscalationSignal {
  caller: string;
  buckets: Array<{ label: string; count: number }>;
  trendRatio: number;
  reason: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface ProximitySignal {
  entityRef: string;
  eventCount: number;
  distinctLocations: number;
  firstSeen: string;
  lastSeen: string;
  reason: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

export interface TraffickingIndicator {
  phones: string[];
  locations: string[];
  sharedPhoneCount: number;
  reason: string;
  severity: "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface ThreatKeywordHit {
  keyword: string;
  snippet: string;
  source: "DESCRIPTION" | "NOTE";
}

export interface WomenSafetyResult {
  stalking: StalkingSignal[];
  escalation: EscalationSignal[];
  proximity: ProximitySignal[];
  trafficking: TraffickingIndicator[];
  threatKeywords: ThreatKeywordHit[];
  computedAt: string;
}

const FEATURE = "WOMEN_SAFETY";
const NIGHT_START = 22;
const NIGHT_END = 5;
const MIN_STALK_CALLS = 5;
const MIN_NIGHT_CALLS = 3;

/** Narrative threat/harassment keywords (EN/HI) — assistive flags only. */
const THREAT_KEYWORDS = [
  "threat",
  "kill",
  "rape",
  "stalk",
  "harass",
  "follow",
  "acid",
  "dowry",
  "blackmail",
  "धरमकी",
  "छेड़छाड़",
  "स्टॉकिंग",
  "रेप",
  "मार डालूंगा",
  "पीछा",
];

function isNightHour(d: Date): boolean {
  const h = d.getUTCHours();
  return h >= NIGHT_START || h < NIGHT_END;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekBucket(d: Date): string {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start.toISOString().slice(0, 10);
}

/**
 * Women-safety intel — assistive leads only (never claims guilt).
 *
 * Research grounding (public investigation practice):
 * - Stalking/harassment often shows repeated contact from same number(s), elevated
 *   night-hour density, and rising call frequency (escalation) in CDR windows.
 * - Proximity/corridor risk uses tower/geo co-presence trails near repeated locations.
 * - Trafficking/missing-person leads: multi-tower hops + shared handler phones.
 * - Threat keywords in FIR/notes are narrative flags for review, not automatic charges.
 *
 * Platform only analyses uploaded CDR/geo/FIR — no citizen GPS tracking / SOS-112.
 */
export async function analyzeWomenSafety(caseId: string): Promise<WomenSafetyResult> {
  const [cdrRaw, locations, entities, caseRow, notes] = await Promise.all([
    prisma.cdrRecord.findMany({
      where: { caseId },
      orderBy: { timestamp: "asc" },
      select: {
        caller: true,
        receiver: true,
        timestamp: true,
        location: true,
        towerId: true,
      },
    }),
    prisma.locationEvent.findMany({
      where: { caseId },
      orderBy: { timestamp: "asc" },
      select: {
        entityRef: true,
        address: true,
        towerId: true,
        timestamp: true,
        latitude: true,
        longitude: true,
      },
    }),
    prisma.entity.findMany({
      where: { caseId, mergedIntoId: null, type: { in: ["PHONE", "PERSON", "LOCATION", "ADDRESS"] } },
      select: { id: true, type: true, normalizedValue: true },
    }),
    prisma.case.findUnique({ where: { id: caseId }, select: { description: true } }),
    prisma.caseNote.findMany({ where: { caseId }, select: { content: true }, take: 50 }),
  ]);

  const cdr = cdrRaw.map((r) => ({
    ...r,
    caller: decryptPii(r.caller),
    receiver: decryptPii(r.receiver),
  }));

  // Infer likely victim/target phones: persons linked or most-received
  const receiveCounts = new Map<string, number>();
  for (const r of cdr) {
    const recv = normalizePhone(r.receiver);
    receiveCounts.set(recv, (receiveCounts.get(recv) ?? 0) + 1);
  }
  const topReceivers = [...receiveCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => p);

  // --- Stalking ---
  const byCaller = new Map<
    string,
    { count: number; night: number; days: Set<string>; targets: Map<string, number> }
  >();
  for (const r of cdr) {
    const caller = normalizePhone(r.caller);
    if (!byCaller.has(caller)) {
      byCaller.set(caller, { count: 0, night: 0, days: new Set(), targets: new Map() });
    }
    const s = byCaller.get(caller)!;
    s.count++;
    if (isNightHour(r.timestamp)) s.night++;
    s.days.add(dayKey(r.timestamp));
    const tgt = normalizePhone(r.receiver);
    s.targets.set(tgt, (s.targets.get(tgt) ?? 0) + 1);
  }

  const stalking: StalkingSignal[] = [];
  for (const [caller, s] of byCaller) {
    if (s.count < MIN_STALK_CALLS && s.night < MIN_NIGHT_CALLS) continue;
    const topTarget = [...s.targets.entries()].sort((a, b) => b[1] - a[1])[0];
    const focusesTopReceiver = topTarget && topReceivers.includes(topTarget[0]);
    if (s.night < MIN_NIGHT_CALLS && !focusesTopReceiver && s.count < 8) continue;

    let severity: StalkingSignal["severity"] = "LOW";
    if (s.night >= 8 || s.count >= 25) severity = "CRITICAL";
    else if (s.night >= 5 || s.count >= 15) severity = "HIGH";
    else if (s.night >= MIN_NIGHT_CALLS || s.count >= 10) severity = "MEDIUM";

    stalking.push({
      caller,
      targetHint: topTarget?.[0] ?? null,
      callCount: s.count,
      nightCallCount: s.night,
      uniqueDays: s.days.size,
      reason: `Caller ${caller} made ${s.count} calls across ${s.days.size} day(s), including ${s.night} night-hour (22:00–05:00 UTC) call(s)${
        topTarget ? ` with concentration toward ${topTarget[0]}` : ""
      }. Stalking-pattern lead — review recommended.`,
      severity,
    });
  }

  // --- Escalation: rising weekly call counts ---
  const escalation: EscalationSignal[] = [];
  for (const [caller, s] of byCaller) {
    if (s.count < 6) continue;
    const weeks = new Map<string, number>();
    for (const r of cdr) {
      if (normalizePhone(r.caller) !== caller) continue;
      const w = weekBucket(r.timestamp);
      weeks.set(w, (weeks.get(w) ?? 0) + 1);
    }
    const buckets = [...weeks.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, count }));
    if (buckets.length < 2) continue;
    const first = buckets[0].count || 1;
    const last = buckets[buckets.length - 1].count;
    const trendRatio = last / first;
    if (trendRatio < 1.5) continue;

    let severity: EscalationSignal["severity"] = "LOW";
    if (trendRatio >= 4) severity = "CRITICAL";
    else if (trendRatio >= 2.5) severity = "HIGH";
    else severity = "MEDIUM";

    escalation.push({
      caller,
      buckets,
      trendRatio: Math.round(trendRatio * 100) / 100,
      reason: `Caller ${caller} weekly call volume rose from ${first} to ${last} (×${trendRatio.toFixed(1)}). Escalation lead — review recommended.`,
      severity,
    });
  }

  // --- Proximity from locationEvents ---
  const byEntity = new Map<
    string,
    { count: number; locs: Set<string>; first: Date; last: Date }
  >();
  for (const l of locations) {
    const ref = l.entityRef ?? "unknown";
    const locKey =
      l.address ??
      l.towerId ??
      (l.latitude != null && l.longitude != null
        ? `${l.latitude.toFixed(3)},${l.longitude.toFixed(3)}`
        : "unknown");
    if (!byEntity.has(ref)) {
      byEntity.set(ref, { count: 0, locs: new Set(), first: l.timestamp, last: l.timestamp });
    }
    const e = byEntity.get(ref)!;
    e.count++;
    e.locs.add(locKey);
    if (l.timestamp < e.first) e.first = l.timestamp;
    if (l.timestamp > e.last) e.last = l.timestamp;
  }

  const proximity: ProximitySignal[] = [];
  for (const [entityRef, e] of byEntity) {
    if (e.count < 3) continue;
    const spanHours = (e.last.getTime() - e.first.getTime()) / 3_600_000;
    let severity: ProximitySignal["severity"] = "LOW";
    if (e.count >= 10 && e.locs.size <= 2) severity = "HIGH";
    else if (e.count >= 5) severity = "MEDIUM";

    proximity.push({
      entityRef,
      eventCount: e.count,
      distinctLocations: e.locs.size,
      firstSeen: e.first.toISOString(),
      lastSeen: e.last.toISOString(),
      reason: `Entity/ref ${entityRef} has ${e.count} geo events across ${e.locs.size} location(s) over ~${Math.round(spanHours)}h. Proximity/corridor lead.`,
      severity,
    });
  }

  // --- Trafficking: multi-location + shared phones ---
  const trafficking: TraffickingIndicator[] = [];
  const phoneTowers = new Map<string, Set<string>>();
  for (const r of cdr) {
    const tower = r.towerId ?? r.location;
    if (!tower) continue;
    for (const p of [normalizePhone(r.caller), normalizePhone(r.receiver)]) {
      if (!phoneTowers.has(p)) phoneTowers.set(p, new Set());
      phoneTowers.get(p)!.add(tower);
    }
  }

  const multiLocPhones = [...phoneTowers.entries()].filter(([, locs]) => locs.size >= 3);
  const locationEntities = entities
    .filter((e) => e.type === "LOCATION" || e.type === "ADDRESS")
    .map((e) => e.normalizedValue);

  // Shared phones: appear as both frequent caller and with many towers
  const shared = multiLocPhones.filter(([phone, locs]) => {
    const stats = byCaller.get(phone);
    return (stats?.count ?? 0) >= 4 || locs.size >= 4;
  });

  if (shared.length >= 2 || (shared.length >= 1 && locationEntities.length >= 3)) {
    const phones = shared.map(([p]) => p).slice(0, 8);
    const locs = [
      ...new Set(shared.flatMap(([, s]) => [...s])),
      ...locationEntities,
    ].slice(0, 12);
    trafficking.push({
      phones,
      locations: locs,
      sharedPhoneCount: phones.length,
      reason: `${phones.length} phone(s) span multiple towers/locations (${locs.length} distinct). Multi-location + shared-phone trafficking/missing-person lead — review recommended.`,
      severity: phones.length >= 3 || locs.length >= 6 ? "CRITICAL" : locs.length >= 4 ? "HIGH" : "MEDIUM",
    });
  }

  // Also use locationEvents spanning cities if many distinct addresses with shared entityRef phones
  if (locations.length >= 5) {
    const distinct = new Set(
      locations.map((l) => l.address ?? l.towerId ?? "").filter(Boolean)
    );
    if (distinct.size >= 4) {
      const phoneEntities = entities.filter((e) => e.type === "PHONE").map((e) => e.normalizedValue);
      if (phoneEntities.length >= 2) {
        trafficking.push({
          phones: phoneEntities.slice(0, 6),
          locations: [...distinct].slice(0, 10),
          sharedPhoneCount: phoneEntities.length,
          reason: `Geo trail spans ${distinct.size} locations with ${phoneEntities.length} phone entities. Trafficking/transit corridor lead.`,
          severity: distinct.size >= 6 ? "HIGH" : "MEDIUM",
        });
      }
    }
  }

  // Narrative threat keywords (FIR description + notes)
  const threatKeywords: ThreatKeywordHit[] = [];
  const texts: Array<{ source: "DESCRIPTION" | "NOTE"; text: string }> = [];
  if (caseRow?.description) texts.push({ source: "DESCRIPTION", text: caseRow.description });
  for (const n of notes) texts.push({ source: "NOTE", text: n.content });
  for (const t of texts) {
    const lower = t.text.toLowerCase();
    for (const kw of THREAT_KEYWORDS) {
      const idx = lower.indexOf(kw.toLowerCase());
      if (idx < 0) continue;
      const start = Math.max(0, idx - 40);
      const snippet = t.text.slice(start, start + 100).replace(/\s+/g, " ").trim();
      threatKeywords.push({ keyword: kw, snippet, source: t.source });
    }
  }

  return {
    stalking: stalking.sort((a, b) => b.callCount - a.callCount),
    escalation: escalation.sort((a, b) => b.trendRatio - a.trendRatio),
    proximity: proximity.sort((a, b) => b.eventCount - a.eventCount),
    trafficking,
    threatKeywords: threatKeywords.slice(0, 30),
    computedAt: new Date().toISOString(),
  };
}

export async function createWomenSafetyAlerts(caseId: string): Promise<number> {
  const result = await analyzeWomenSafety(caseId);
  let created = 0;

  async function createIfNew(
    type: "COMMUNICATION_BURST" | "COMMON_LOCATION" | "ENTITY_MATCH",
    title: string,
    message: string,
    confidence: number,
    metadata: Record<string, unknown>
  ) {
    const existing = await prisma.alert.findFirst({
      where: {
        caseId,
        type,
        title,
        status: { in: ["NEW", "ACKNOWLEDGED", "INVESTIGATING"] },
      },
    });
    if (existing) return;
    await prisma.alert.create({
      data: {
        type,
        title,
        message,
        confidence,
        caseId,
        metadata: { feature: FEATURE, ...metadata } as object,
      },
    });
    created++;
  }

  for (const s of result.stalking.filter((x) => x.severity !== "LOW").slice(0, 8)) {
    await createIfNew(
      "COMMUNICATION_BURST",
      `Stalking pattern: ${s.caller}`,
      s.reason,
      Math.min(0.5 + s.nightCallCount / 20, 0.9),
      {
        kind: "STALKING",
        caller: s.caller,
        nightCallCount: s.nightCallCount,
        callCount: s.callCount,
        severity: s.severity,
      }
    );
  }

  for (const e of result.escalation.filter((x) => x.severity !== "LOW").slice(0, 5)) {
    await createIfNew(
      "COMMUNICATION_BURST",
      `Harassment escalation: ${e.caller}`,
      e.reason,
      Math.min(0.55 + e.trendRatio / 10, 0.9),
      { kind: "ESCALATION", caller: e.caller, trendRatio: e.trendRatio, buckets: e.buckets }
    );
  }

  for (const p of result.proximity.filter((x) => x.severity !== "LOW").slice(0, 5)) {
    await createIfNew(
      "COMMON_LOCATION",
      `Proximity risk: ${p.entityRef}`,
      p.reason,
      0.7,
      {
        kind: "PROXIMITY",
        entityRef: p.entityRef,
        eventCount: p.eventCount,
        distinctLocations: p.distinctLocations,
      }
    );
  }

  for (const t of result.trafficking.slice(0, 3)) {
    await createIfNew(
      "ENTITY_MATCH",
      `Trafficking/multi-location lead (${t.phones.length} phones)`,
      t.reason,
      0.75,
      {
        kind: "TRAFFICKING",
        phones: t.phones,
        locations: t.locations,
        severity: t.severity,
      }
    );
  }

  return created;
}
