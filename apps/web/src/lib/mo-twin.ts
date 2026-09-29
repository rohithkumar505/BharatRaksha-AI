import { prisma } from "./db";
import { decryptPii } from "./pii-crypto";
import { normalizePhone, normalizeEntityValue } from "./normalize";
import { findSimilarCases } from "./case-twin";

export interface MoFingerprint {
  caseId: string;
  caseNumber: string;
  crimeType: string;
  features: {
    entityTypeHistogram: Record<string, number>;
    topEntityValues: string[];
    avgTxnAmount: number | null;
    txnCount: number;
    cdrCount: number;
    burstiness: number;
    locationDiversity: number;
    nightCallRatio: number;
    uniquePhones: number;
    hasCrypto: boolean;
    hasVehicle: boolean;
    hasUpi: boolean;
  };
  vector: number[];
  label: string;
  computedAt: string;
}

export interface MoTwinHit {
  caseId: string;
  caseNumber: string;
  crimeType: string;
  similarity: number;
  sharedFeatureNotes: string[];
}

export interface MoTwinsResult {
  fingerprint: MoFingerprint;
  twins: MoTwinHit[];
  computedAt: string;
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Build a modus-operandi fingerprint from entities + CDR/txn/geo stats.
 * Grounded in MO / case-linkage practice (Wikipedia “Modus operandi”; behavioral
 * linkage analysis): compare functional patterns across cases as investigative
 * leads — similarity ≠ proof of common offender.
 */
export async function buildMoFingerprint(caseId: string): Promise<MoFingerprint> {
  const [caseRow, entities, cdrRaw, txns, locations] = await Promise.all([
    prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, caseNumber: true, crimeType: true },
    }),
    prisma.entity.findMany({
      where: { caseId, mergedIntoId: null },
      select: { type: true, normalizedValue: true },
    }),
    prisma.cdrRecord.findMany({
      where: { caseId },
      select: { caller: true, receiver: true, timestamp: true },
    }),
    prisma.transaction.findMany({
      where: { caseId },
      select: { amount: true },
    }),
    prisma.locationEvent.findMany({
      where: { caseId },
      select: { address: true, towerId: true, latitude: true, longitude: true },
    }),
  ]);

  const hist: Record<string, number> = {};
  for (const e of entities) {
    hist[e.type] = (hist[e.type] ?? 0) + 1;
  }

  const cdr = cdrRaw.map((r) => ({
    caller: decryptPii(r.caller),
    receiver: decryptPii(r.receiver),
    timestamp: r.timestamp,
  }));

  const phones = new Set<string>();
  let night = 0;
  for (const r of cdr) {
    phones.add(normalizePhone(r.caller));
    phones.add(normalizePhone(r.receiver));
    const h = r.timestamp.getUTCHours();
    if (h >= 22 || h < 5) night++;
  }

  const amounts = txns.map((t) => Number(t.amount));
  const avgTxn =
    amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : null;

  const locKeys = new Set(
    locations.map(
      (l) =>
        l.address ??
        l.towerId ??
        (l.latitude != null ? `${l.latitude.toFixed(2)},${l.longitude?.toFixed(2)}` : "")
    ).filter(Boolean)
  );

  // Simple burstiness: max hourly count / avg hourly
  const byHour = new Map<string, number>();
  for (const r of cdr) {
    const key = r.timestamp.toISOString().slice(0, 13);
    byHour.set(key, (byHour.get(key) ?? 0) + 1);
  }
  const hourCounts = [...byHour.values()];
  const avgHour = hourCounts.length ? hourCounts.reduce((a, b) => a + b, 0) / hourCounts.length : 0;
  const maxHour = hourCounts.length ? Math.max(...hourCounts) : 0;
  const burstiness = avgHour > 0 ? maxHour / avgHour : 0;

  const features = {
    entityTypeHistogram: hist,
    topEntityValues: entities
      .slice(0, 20)
      .map((e) => `${e.type}:${normalizeEntityValue(e.type, e.normalizedValue)}`),
    avgTxnAmount: avgTxn,
    txnCount: txns.length,
    cdrCount: cdr.length,
    burstiness: Math.round(burstiness * 100) / 100,
    locationDiversity: locKeys.size,
    nightCallRatio: cdr.length ? night / cdr.length : 0,
    uniquePhones: phones.size,
    hasCrypto: (hist.CRYPTO_WALLET ?? 0) > 0,
    hasVehicle: (hist.VEHICLE ?? 0) > 0,
    hasUpi: (hist.UPI ?? 0) > 0,
  };

  const vector = [
    features.txnCount,
    features.cdrCount,
    features.uniquePhones,
    features.locationDiversity,
    features.burstiness,
    features.nightCallRatio * 10,
    features.avgTxnAmount ? Math.log10(features.avgTxnAmount + 1) : 0,
    hist.PHONE ?? 0,
    hist.PERSON ?? 0,
    hist.UPI ?? 0,
    hist.VEHICLE ?? 0,
    hist.DOMAIN ?? 0,
    hist.CRYPTO_WALLET ?? 0,
    hist.EMAIL ?? 0,
    features.hasCrypto ? 1 : 0,
    features.hasVehicle ? 1 : 0,
    features.hasUpi ? 1 : 0,
  ];

  const labelParts = [
    caseRow?.crimeType ?? "unknown",
    features.hasUpi ? "upi" : null,
    features.hasVehicle ? "vehicle" : null,
    features.hasCrypto ? "crypto" : null,
    features.burstiness >= 3 ? "burst-cdr" : null,
    features.nightCallRatio >= 0.3 ? "night-active" : null,
  ].filter(Boolean);

  return {
    caseId,
    caseNumber: caseRow?.caseNumber ?? caseId,
    crimeType: caseRow?.crimeType ?? "Unknown",
    features,
    vector,
    label: labelParts.join("|"),
    computedAt: new Date().toISOString(),
  };
}

export async function findMoTwins(
  caseId: string,
  limit = 8
): Promise<MoTwinsResult> {
  const fingerprint = await buildMoFingerprint(caseId);
  const similar = await findSimilarCases(caseId, Math.max(limit * 3, 15));

  const twins: MoTwinHit[] = [];
  for (const hit of similar.similar.slice(0, limit * 2)) {
    const otherFp = await buildMoFingerprint(hit.caseId);
    const sim = cosine(fingerprint.vector, otherFp.vector);
    const notes: string[] = [];
    if (fingerprint.crimeType.toLowerCase() === otherFp.crimeType.toLowerCase()) {
      notes.push("Same crime type");
    }
    if (fingerprint.features.hasUpi && otherFp.features.hasUpi) notes.push("Both UPI-linked");
    if (fingerprint.features.hasVehicle && otherFp.features.hasVehicle) notes.push("Both vehicle-linked");
    if (fingerprint.features.hasCrypto && otherFp.features.hasCrypto) notes.push("Both crypto-linked");
    if (fingerprint.features.burstiness >= 2 && otherFp.features.burstiness >= 2) {
      notes.push("Elevated CDR burstiness");
    }
    for (const v of hit.sharedValues.slice(0, 5)) notes.push(`Shared ${v}`);

    twins.push({
      caseId: hit.caseId,
      caseNumber: hit.caseNumber,
      crimeType: hit.crimeType,
      similarity: Math.round(sim * 1000) / 1000,
      sharedFeatureNotes: notes,
    });
  }

  twins.sort((a, b) => b.similarity - a.similarity);

  return {
    fingerprint,
    twins: twins.slice(0, limit),
    computedAt: new Date().toISOString(),
  };
}
