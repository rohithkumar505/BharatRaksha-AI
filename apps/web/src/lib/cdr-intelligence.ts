import { prisma } from "./db";
import { normalizePhone } from "./normalize";
import { decryptPii } from "./pii-crypto";
import type { CdrRecord } from "@bharat-raksha/database";

export interface FrequentContact {
  caller: string;
  receiver: string;
  callCount: number;
  totalDurationSec: number;
  avgDurationSec: number;
  firstCall: string;
  lastCall: string;
  evidenceIds: string[];
}

export interface CommunicationBurst {
  phone: string;
  windowStart: string;
  windowEnd: string;
  callCount: number;
  baselineDailyAvg: number;
  spikeRatio: number;
  involvedParties: string[];
  reason: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface ColocationEvent {
  towerId: string;
  windowStart: string;
  windowEnd: string;
  phones: string[];
  callCount: number;
  overlapMinutes: number;
  reason: string;
}

export interface DeviceLink {
  imei: string;
  phones: string[];
  callCount: number;
  sharedDevice: boolean;
  firstSeen: string;
  lastSeen: string;
}

export interface PhoneActivity {
  phone: string;
  totalCalls: number;
  totalDurationSec: number;
  uniqueContacts: number;
  outgoing: number;
  incoming: number;
  towersVisited: string[];
}

export interface CommunicationSubgraph {
  nodes: Array<{ id: string; label: string; value: string; type: string }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    weight: number;
    totalDurationSec: number;
  }>;
}

export interface CdrAnalysisResult {
  summary: {
    totalRecords: number;
    uniquePhones: number;
    uniqueTowers: number;
    uniqueDevices: number;
    dateRange: { from: string | null; to: string | null };
    totalCallDurationSec: number;
  };
  frequentContacts: FrequentContact[];
  bursts: CommunicationBurst[];
  colocations: ColocationEvent[];
  deviceLinks: DeviceLink[];
  phoneActivity: PhoneActivity[];
  subgraph: CommunicationSubgraph;
  hourlyDistribution: Array<{ hour: number; count: number }>;
  computedAt: string;
}

const BURST_WINDOW_MS = 60 * 60 * 1000; // 1 hour rolling window
const COLOCATION_WINDOW_MS = 30 * 60 * 1000; // 30 min tower overlap
const MIN_BURST_CALLS = 5;
const BURST_SPIKE_RATIO = 3;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pairKey(a: string, b: string): string {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return na < nb ? `${na}|${nb}` : `${nb}|${na}`;
}

export function analyzeFrequentContacts(records: CdrRecord[]): FrequentContact[] {
  const pairs = new Map<
    string,
    {
      caller: string;
      receiver: string;
      count: number;
      duration: number;
      first: Date;
      last: Date;
      evidence: Set<string>;
    }
  >();

  for (const r of records) {
    const key = pairKey(r.caller, r.receiver);
    const existing = pairs.get(key);
    if (existing) {
      existing.count++;
      existing.duration += r.duration;
      if (r.timestamp < existing.first) existing.first = r.timestamp;
      if (r.timestamp > existing.last) existing.last = r.timestamp;
      if (r.evidenceId) existing.evidence.add(r.evidenceId);
    } else {
      pairs.set(key, {
        caller: normalizePhone(r.caller),
        receiver: normalizePhone(r.receiver),
        count: 1,
        duration: r.duration,
        first: r.timestamp,
        last: r.timestamp,
        evidence: new Set(r.evidenceId ? [r.evidenceId] : []),
      });
    }
  }

  return [...pairs.values()]
    .map((p) => ({
      caller: p.caller,
      receiver: p.receiver,
      callCount: p.count,
      totalDurationSec: p.duration,
      avgDurationSec: Math.round(p.duration / p.count),
      firstCall: p.first.toISOString(),
      lastCall: p.last.toISOString(),
      evidenceIds: [...p.evidence],
    }))
    .sort((a, b) => b.callCount - a.callCount);
}

/** Rolling 1-hour window burst vs daily baseline (TATVA / i2 pattern) */
export function detectBursts(records: CdrRecord[]): CommunicationBurst[] {
  if (records.length === 0) return [];

  const byPhone = new Map<string, CdrRecord[]>();
  for (const r of records) {
    for (const phone of [normalizePhone(r.caller), normalizePhone(r.receiver)]) {
      if (!byPhone.has(phone)) byPhone.set(phone, []);
      byPhone.get(phone)!.push(r);
    }
  }

  const bursts: CommunicationBurst[] = [];

  for (const [phone, phoneRecords] of byPhone) {
    const sorted = [...phoneRecords].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const dailyCounts = new Map<string, number>();
    for (const r of sorted) {
      const dk = dayKey(r.timestamp);
      dailyCounts.set(dk, (dailyCounts.get(dk) ?? 0) + 1);
    }
    const dailyValues = [...dailyCounts.values()];
    const baselineDaily =
      dailyValues.length > 0
        ? dailyValues.reduce((s, v) => s + v, 0) / dailyValues.length
        : 1;
    const baselineHourly = Math.max(baselineDaily / 24, 0.5);

    for (let i = 0; i < sorted.length; i++) {
      const windowStart = sorted[i].timestamp.getTime();
      const windowEnd = windowStart + BURST_WINDOW_MS;
      const inWindow = sorted.filter(
        (r) => r.timestamp.getTime() >= windowStart && r.timestamp.getTime() < windowEnd
      );

      if (inWindow.length < MIN_BURST_CALLS) continue;

      const spikeRatio = inWindow.length / baselineHourly;
      if (spikeRatio < BURST_SPIKE_RATIO && inWindow.length < 15) continue;

      const parties = new Set<string>();
      for (const r of inWindow) {
        parties.add(normalizePhone(r.caller));
        parties.add(normalizePhone(r.receiver));
      }

      const severity: CommunicationBurst["severity"] =
        spikeRatio >= 10 || inWindow.length >= 30
          ? "CRITICAL"
          : spikeRatio >= 6 || inWindow.length >= 20
            ? "HIGH"
            : spikeRatio >= 4 || inWindow.length >= 10
              ? "MEDIUM"
              : "LOW";

      bursts.push({
        phone,
        windowStart: sorted[i].timestamp.toISOString(),
        windowEnd: new Date(windowEnd).toISOString(),
        callCount: inWindow.length,
        baselineDailyAvg: Math.round(baselineDaily * 10) / 10,
        spikeRatio: Math.round(spikeRatio * 10) / 10,
        involvedParties: [...parties],
        reason: `${inWindow.length} calls in 1 hour vs baseline ~${baselineHourly.toFixed(1)}/hr (${spikeRatio.toFixed(1)}x spike). Review recommended.`,
        severity,
      });

      i += inWindow.length - 1;
    }
  }

  const seen = new Set<string>();
  return bursts
    .filter((b) => {
      const key = `${b.phone}|${b.windowStart.slice(0, 13)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.spikeRatio - a.spikeRatio)
    .slice(0, 20);
}

/** Same tower + overlapping time window — multiple phones co-located */
export function detectColocations(records: CdrRecord[]): ColocationEvent[] {
  const withTower = records.filter((r) => r.towerId || r.location);
  if (withTower.length === 0) return [];

  const buckets = new Map<string, CdrRecord[]>();

  for (const r of withTower) {
    const tower = r.towerId ?? r.location ?? "unknown";
    const bucketTime = Math.floor(r.timestamp.getTime() / COLOCATION_WINDOW_MS);
    const key = `${tower}|${bucketTime}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }

  const events: ColocationEvent[] = [];

  for (const [key, bucketRecords] of buckets) {
    const [towerId] = key.split("|");
    const phones = new Set<string>();
    for (const r of bucketRecords) {
      phones.add(normalizePhone(r.caller));
      phones.add(normalizePhone(r.receiver));
    }

    if (phones.size < 2) continue;

    const times = bucketRecords.map((r) => r.timestamp.getTime());
    const windowStart = new Date(Math.min(...times));
    const windowEnd = new Date(Math.max(...times));

    events.push({
      towerId,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      phones: [...phones],
      callCount: bucketRecords.length,
      overlapMinutes: Math.round(COLOCATION_WINDOW_MS / 60000),
      reason: `${phones.size} phones active at tower "${towerId}" within ${COLOCATION_WINDOW_MS / 60000} min window — potential co-location.`,
    });
  }

  return events.sort((a, b) => b.phones.length - a.phones.length).slice(0, 25);
}

/** IMEI → phone mapping; flag shared devices */
export function analyzeDeviceLinks(records: CdrRecord[]): DeviceLink[] {
  const byImei = new Map<string, { phones: Set<string>; count: number; first: Date; last: Date }>();

  for (const r of records) {
    if (!r.imei) continue;
    const imei = r.imei.trim();
    const existing = byImei.get(imei);
    if (existing) {
      existing.phones.add(normalizePhone(r.caller));
      existing.count++;
      if (r.timestamp < existing.first) existing.first = r.timestamp;
      if (r.timestamp > existing.last) existing.last = r.timestamp;
    } else {
      byImei.set(imei, {
        phones: new Set([normalizePhone(r.caller)]),
        count: 1,
        first: r.timestamp,
        last: r.timestamp,
      });
    }
  }

  return [...byImei.entries()]
    .map(([imei, data]) => ({
      imei,
      phones: [...data.phones],
      callCount: data.count,
      sharedDevice: data.phones.size > 1,
      firstSeen: data.first.toISOString(),
      lastSeen: data.last.toISOString(),
    }))
    .sort((a, b) => b.callCount - a.callCount);
}

export function analyzePhoneActivity(records: CdrRecord[]): PhoneActivity[] {
  const activity = new Map<
    string,
    {
      total: number;
      duration: number;
      contacts: Set<string>;
      out: number;
      in: number;
      towers: Set<string>;
    }
  >();

  for (const r of records) {
    const caller = normalizePhone(r.caller);
    const receiver = normalizePhone(r.receiver);
    const tower = r.towerId ?? r.location;

    for (const [phone, isOutgoing] of [
      [caller, true],
      [receiver, false],
    ] as const) {
      if (!activity.has(phone)) {
        activity.set(phone, {
          total: 0,
          duration: 0,
          contacts: new Set(),
          out: 0,
          in: 0,
          towers: new Set(),
        });
      }
      const a = activity.get(phone)!;
      a.total++;
      a.duration += r.duration;
      if (isOutgoing) {
        a.out++;
        a.contacts.add(receiver);
      } else {
        a.in++;
        a.contacts.add(caller);
      }
      if (tower) a.towers.add(tower);
    }
  }

  return [...activity.entries()]
    .map(([phone, a]) => ({
      phone,
      totalCalls: a.total,
      totalDurationSec: a.duration,
      uniqueContacts: a.contacts.size,
      outgoing: a.out,
      incoming: a.in,
      towersVisited: [...a.towers],
    }))
    .sort((a, b) => b.totalCalls - a.totalCalls);
}

export function buildCommunicationSubgraph(records: CdrRecord[]): CommunicationSubgraph {
  const phoneNodes = new Map<string, { id: string; value: string }>();
  const deviceNodes = new Map<string, { id: string; value: string }>();
  const edgeMap = new Map<
    string,
    { source: string; target: string; weight: number; duration: number }
  >();

  function ensurePhone(p: string) {
    const norm = normalizePhone(p);
    if (!phoneNodes.has(norm)) {
      phoneNodes.set(norm, { id: `phone:${norm}`, value: norm });
    }
    return norm;
  }

  for (const r of records) {
    const caller = ensurePhone(r.caller);
    const receiver = ensurePhone(r.receiver);
    const edgeKey = `${caller}|${receiver}`;
    const existing = edgeMap.get(edgeKey);
    if (existing) {
      existing.weight++;
      existing.duration += r.duration;
    } else {
      edgeMap.set(edgeKey, { source: caller, target: receiver, weight: 1, duration: r.duration });
    }

    if (r.imei) {
      const imei = r.imei.trim();
      if (!deviceNodes.has(imei)) {
        deviceNodes.set(imei, { id: `device:${imei}`, value: imei });
      }
      const devEdgeKey = `${caller}|device:${imei}`;
      const devEdge = edgeMap.get(devEdgeKey);
      if (devEdge) {
        devEdge.weight++;
      } else {
        edgeMap.set(devEdgeKey, { source: caller, target: `device:${imei}`, weight: 1, duration: 0 });
      }
    }
  }

  const nodes = [
    ...[...phoneNodes.values()].map((p) => ({
      id: p.id,
      label: "Phone",
      value: p.value,
      type: "Phone",
    })),
    ...[...deviceNodes.values()].map((d) => ({
      id: d.id,
      label: "Device",
      value: d.value,
      type: "Device",
    })),
  ];

  const edges = [...edgeMap.entries()].map(([key, e]) => ({
    id: `cdr-edge:${key}`,
    source: `phone:${e.source}`,
    target: e.target.startsWith("device:") ? e.target : `phone:${e.target}`,
    type: e.target.startsWith("device:") ? "USES_DEVICE" : "CALLED",
    weight: e.weight,
    totalDurationSec: e.duration,
  }));

  return { nodes, edges };
}

function hourlyDistribution(records: CdrRecord[]) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const r of records) {
    hours[r.timestamp.getUTCHours()].count++;
  }
  return hours;
}

export async function analyzeCdrForCase(caseId: string): Promise<CdrAnalysisResult> {
  const rawRecords = await prisma.cdrRecord.findMany({
    where: { caseId },
    orderBy: { timestamp: "asc" },
  });
  const records = rawRecords.map((r) => ({
    ...r,
    caller: decryptPii(r.caller),
    receiver: decryptPii(r.receiver),
  }));

  const phones = new Set<string>();
  const towers = new Set<string>();
  const devices = new Set<string>();
  let totalDuration = 0;

  for (const r of records) {
    phones.add(normalizePhone(r.caller));
    phones.add(normalizePhone(r.receiver));
    if (r.towerId ?? r.location) towers.add(r.towerId ?? r.location!);
    if (r.imei) devices.add(r.imei);
    totalDuration += r.duration;
  }

  return {
    summary: {
      totalRecords: records.length,
      uniquePhones: phones.size,
      uniqueTowers: towers.size,
      uniqueDevices: devices.size,
      dateRange: {
        from: records[0]?.timestamp.toISOString() ?? null,
        to: records[records.length - 1]?.timestamp.toISOString() ?? null,
      },
      totalCallDurationSec: totalDuration,
    },
    frequentContacts: analyzeFrequentContacts(records),
    bursts: detectBursts(records),
    colocations: detectColocations(records),
    deviceLinks: analyzeDeviceLinks(records),
    phoneActivity: analyzePhoneActivity(records),
    subgraph: buildCommunicationSubgraph(records),
    hourlyDistribution: hourlyDistribution(records),
    computedAt: new Date().toISOString(),
  };
}

/** Create COMMUNICATION_BURST and COMMON_LOCATION alerts from analysis */
export async function createCdrAlerts(caseId: string): Promise<number> {
  const analysis = await analyzeCdrForCase(caseId);
  let created = 0;

  for (const burst of analysis.bursts.slice(0, 10)) {
    const existing = await prisma.alert.findFirst({
      where: {
        caseId,
        type: "COMMUNICATION_BURST",
        status: { in: ["NEW", "ACKNOWLEDGED", "INVESTIGATING"] },
        message: { contains: burst.phone },
      },
    });
    if (existing) continue;

    await prisma.alert.create({
      data: {
        type: "COMMUNICATION_BURST",
        title: `Communication burst: ${burst.phone}`,
        message: burst.reason,
        confidence: Math.min(burst.spikeRatio / 10, 0.95),
        caseId,
        metadata: {
          phone: burst.phone,
          callCount: burst.callCount,
          spikeRatio: burst.spikeRatio,
          severity: burst.severity,
          windowStart: burst.windowStart,
          involvedParties: burst.involvedParties,
        },
      },
    });
    created++;
  }

  for (const coloc of analysis.colocations.slice(0, 10)) {
    const existing = await prisma.alert.findFirst({
      where: {
        caseId,
        type: "COMMON_LOCATION",
        status: { in: ["NEW", "ACKNOWLEDGED", "INVESTIGATING"] },
        message: { contains: coloc.towerId },
      },
    });
    if (existing) continue;

    await prisma.alert.create({
      data: {
        type: "COMMON_LOCATION",
        title: `Co-location at ${coloc.towerId}`,
        message: coloc.reason,
        confidence: Math.min(coloc.phones.length / 5, 0.9),
        caseId,
        metadata: {
          towerId: coloc.towerId,
          phones: coloc.phones,
          windowStart: coloc.windowStart,
          callCount: coloc.callCount,
        },
      },
    });
    created++;
  }

  for (const device of analysis.deviceLinks.filter((d) => d.sharedDevice)) {
    const existing = await prisma.alert.findFirst({
      where: {
        caseId,
        type: "COMMUNICATION_BURST",
        title: { contains: device.imei },
      },
    });
    if (existing) continue;

    await prisma.alert.create({
      data: {
        type: "COMMUNICATION_BURST",
        title: `Shared device IMEI: ${device.imei}`,
        message: `IMEI ${device.imei} used by ${device.phones.length} phones: ${device.phones.join(", ")}. Possible device sharing — review recommended.`,
        confidence: 0.8,
        caseId,
        metadata: { imei: device.imei, phones: device.phones, sharedDevice: true },
      },
    });
    created++;
  }

  return created;
}
