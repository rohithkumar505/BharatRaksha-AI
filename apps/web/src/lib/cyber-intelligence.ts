import { prisma } from "./db";
import { decryptPii } from "./pii-crypto";
import { normalizePhone } from "./normalize";
import { analyzeFinancialForCase } from "./financial-intelligence";

export interface MuleSignal {
  account: string;
  score: number;
  factors: string[];
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface SimSwapSuspect {
  phone: string;
  imeis: string[];
  reason: string;
  confidence: number;
  nearTxnWindow: boolean;
}

export interface PhishingUrlHit {
  value: string;
  source: "ENTITY" | "NOTE" | "DESCRIPTION";
  riskHints: string[];
  evidenceId?: string | null;
}

export interface EmailIntelItem {
  email: string;
  domain: string;
  linkedEntities: string[];
  riskHints: string[];
}

export interface IpDeviceCluster {
  key: string;
  type: "IP" | "DEVICE";
  linkedValues: string[];
  entityIds: string[];
  reason: string;
}

export interface CryptoHop {
  wallet: string;
  linkedAccounts: string[];
  hopCount: number;
  reason: string;
}

export interface CyberIntelResult {
  muleSignals: MuleSignal[];
  simSwapSuspects: SimSwapSuspect[];
  phishingUrls: PhishingUrlHit[];
  emailIntel: EmailIntelItem[];
  ipDeviceClusters: IpDeviceCluster[];
  cryptoHops: CryptoHop[];
  computedAt: string;
}

const URL_RE = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|(?:[a-z0-9-]+\.)+(?:com|in|net|org|io|co|xyz|info|me|ru|cn)(?:\/[^\s<>"']*)?/gi;
const SUSPICIOUS_TLDS = [".xyz", ".top", ".click", ".loan", ".gq", ".tk", ".ml", ".cf"];
const FEATURE = "CYBER_INTEL";

function domainOf(emailOrUrl: string): string {
  if (emailOrUrl.includes("@")) return emailOrUrl.split("@")[1]?.toLowerCase() ?? "";
  try {
    const withProto = emailOrUrl.startsWith("http") ? emailOrUrl : `http://${emailOrUrl}`;
    return new URL(withProto).hostname.toLowerCase();
  } catch {
    return emailOrUrl.toLowerCase();
  }
}

/**
 * Cyber intelligence — assistive leads from uploaded evidence only.
 *
 * Research grounding (public practice):
 * - UPI/digital fraud: follow victim→device/SIM→UPI→mule hop chains; mule fan-in/out
 *   and rapid layering are known typology signals (RBI mule guidance / payment forensics).
 * - SIM-swap / OTP fraud: correlate IMEI changes / CDR gaps with nearby bank txn windows
 *   (SIM-swap digital forensics literature).
 * - Phishing: suspicious URLs/domains and disposable email domains from narrative/entities.
 * - Device/IP clustering: shared IMEI/IP across identities is a reuse signal.
 *
 * Does not fetch telco/bank APIs — analyses case uploads. Not proof of guilt.
 */
export async function analyzeCyberIntel(caseId: string): Promise<CyberIntelResult> {
  const [entities, notes, caseRow, cdrRaw, relationships] = await Promise.all([
    prisma.entity.findMany({
      where: { caseId, mergedIntoId: null },
      select: {
        id: true,
        type: true,
        normalizedValue: true,
        rawValues: true,
        evidenceId: true,
      },
    }),
    prisma.caseNote.findMany({ where: { caseId }, select: { content: true } }),
    prisma.case.findUnique({
      where: { id: caseId },
      select: { description: true },
    }),
    prisma.cdrRecord.findMany({
      where: { caseId },
      select: {
        caller: true,
        receiver: true,
        timestamp: true,
        imei: true,
        evidenceId: true,
      },
    }),
    prisma.relationship.findMany({
      where: { sourceEntity: { caseId } },
      select: {
        sourceEntityId: true,
        targetEntityId: true,
        relationType: true,
        sourceEntity: { select: { type: true, normalizedValue: true } },
        targetEntity: { select: { type: true, normalizedValue: true } },
      },
    }),
  ]);

  const cdr = cdrRaw.map((r) => ({
    ...r,
    caller: decryptPii(r.caller),
    receiver: decryptPii(r.receiver),
  }));

  // --- Mule signals from financial analysis ---
  let muleSignals: MuleSignal[] = [];
  try {
    const fin = await analyzeFinancialForCase(caseId);
    muleSignals = fin.suspiciousScores
      .filter((s) => s.severity === "HIGH" || s.severity === "CRITICAL" || s.score >= 40)
      .slice(0, 15)
      .map((s) => ({
        account: s.account,
        score: s.score,
        factors: s.factors,
        severity: s.severity,
      }));

    for (const rapid of fin.rapidMovements.slice(0, 5)) {
      const account = rapid.path[0];
      if (!muleSignals.some((m) => m.account === account)) {
        muleSignals.push({
          account,
          score: 70,
          factors: [`Rapid movement ${rapid.hops} hops in ${rapid.timeSpanMinutes}m`],
          severity: rapid.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
        });
      }
    }
  } catch {
    // no txns
  }

  // --- SIM-swap suspects: phone with multiple IMEIs, optionally near txn ---
  const phoneImeis = new Map<string, Set<string>>();
  for (const r of cdr) {
    if (!r.imei) continue;
    const phones = [normalizePhone(r.caller), normalizePhone(r.receiver)];
    for (const p of phones) {
      if (!phoneImeis.has(p)) phoneImeis.set(p, new Set());
      phoneImeis.get(p)!.add(r.imei);
    }
  }

  let txnTimes: Date[] = [];
  try {
    const txns = await prisma.transaction.findMany({
      where: { caseId },
      select: { timestamp: true },
    });
    txnTimes = txns.map((t) => t.timestamp);
  } catch {
    txnTimes = [];
  }

  const simSwapSuspects: SimSwapSuspect[] = [];
  for (const [phone, imeis] of phoneImeis) {
    if (imeis.size < 2) continue;
    const phoneCalls = cdr.filter(
      (r) => normalizePhone(r.caller) === phone || normalizePhone(r.receiver) === phone
    );
    const nearTxnWindow = phoneCalls.some((c) =>
      txnTimes.some((t) => Math.abs(t.getTime() - c.timestamp.getTime()) <= 2 * 3_600_000)
    );
    simSwapSuspects.push({
      phone,
      imeis: [...imeis],
      reason: `Phone ${phone} observed with ${imeis.size} distinct IMEIs (${[...imeis].join(", ")})${
        nearTxnWindow ? " near transaction window" : ""
      }. Possible SIM/device change — review recommended.`,
      confidence: Math.min(0.55 + imeis.size * 0.12 + (nearTxnWindow ? 0.15 : 0), 0.92),
      nearTxnWindow,
    });
  }

  // Shared IMEI across multiple caller phones
  const imeiToPhones = new Map<string, Set<string>>();
  for (const r of cdr) {
    if (!r.imei) continue;
    if (!imeiToPhones.has(r.imei)) imeiToPhones.set(r.imei, new Set());
    imeiToPhones.get(r.imei)!.add(normalizePhone(r.caller));
  }
  for (const [imei, phones] of imeiToPhones) {
    if (phones.size < 2) continue;
    for (const phone of phones) {
      if (simSwapSuspects.some((s) => s.phone === phone && s.imeis.includes(imei))) continue;
      simSwapSuspects.push({
        phone,
        imeis: [imei],
        reason: `IMEI ${imei} shared across phones ${[...phones].join(", ")}. Device sharing or cloning lead.`,
        confidence: 0.78,
        nearTxnWindow: false,
      });
    }
  }

  // --- Phishing URLs from domains + narrative ---
  const phishingUrls: PhishingUrlHit[] = [];
  for (const e of entities.filter((x) => x.type === "DOMAIN")) {
    const hints: string[] = [];
    const v = e.normalizedValue.toLowerCase();
    if (SUSPICIOUS_TLDS.some((t) => v.endsWith(t))) hints.push("suspicious TLD");
    if (/otp|bank|kyc|verify|login|secure|update|reward/i.test(v)) hints.push("credential-harvest keyword");
    phishingUrls.push({
      value: e.normalizedValue,
      source: "ENTITY",
      riskHints: hints.length ? hints : ["domain entity present"],
      evidenceId: e.evidenceId,
    });
  }

  const textBlobs: Array<{ text: string; source: "NOTE" | "DESCRIPTION" }> = [
    ...(caseRow?.description
      ? [{ text: caseRow.description, source: "DESCRIPTION" as const }]
      : []),
    ...notes.map((n) => ({ text: n.content, source: "NOTE" as const })),
  ];
  for (const blob of textBlobs) {
    const matches = blob.text.match(URL_RE) ?? [];
    for (const raw of matches) {
      const value = raw.replace(/[.,;)]+$/, "");
      const hints: string[] = [];
      const lower = value.toLowerCase();
      if (SUSPICIOUS_TLDS.some((t) => lower.includes(t))) hints.push("suspicious TLD");
      if (/otp|bank|kyc|verify|login|secure|update|reward|upi/i.test(lower)) {
        hints.push("credential-harvest keyword");
      }
      if (!phishingUrls.some((p) => p.value === value)) {
        phishingUrls.push({
          value,
          source: blob.source,
          riskHints: hints.length ? hints : ["URL found in narrative"],
        });
      }
    }
  }

  // --- Email intel ---
  const emailIntel: EmailIntelItem[] = [];
  const emails = entities.filter((e) => e.type === "EMAIL");
  for (const em of emails) {
    const email = em.normalizedValue.toLowerCase();
    const domain = domainOf(email);
    const linked = relationships
      .filter(
        (r) =>
          r.sourceEntityId === em.id ||
          r.targetEntityId === em.id ||
          r.sourceEntity.normalizedValue === em.normalizedValue ||
          r.targetEntity.normalizedValue === em.normalizedValue
      )
      .map((r) =>
        r.sourceEntityId === em.id
          ? `${r.targetEntity.type}:${r.targetEntity.normalizedValue}`
          : `${r.sourceEntity.type}:${r.sourceEntity.normalizedValue}`
      );
    const riskHints: string[] = [];
    if (/mailinator|tempmail|guerrillamail|yopmail|10minutemail/i.test(domain)) {
      riskHints.push("disposable mail domain");
    }
    if (SUSPICIOUS_TLDS.some((t) => domain.endsWith(t.replace(".", "")))) {
      riskHints.push("unusual domain");
    }
    emailIntel.push({
      email,
      domain,
      linkedEntities: [...new Set(linked)].slice(0, 10),
      riskHints,
    });
  }

  // --- IP / device clusters ---
  const ipDeviceClusters: IpDeviceCluster[] = [];
  const byIp = entities.filter((e) => e.type === "IP_ADDRESS");
  const byDevice = entities.filter((e) => e.type === "DEVICE");

  for (const ip of byIp) {
    const linked = relationships
      .filter((r) => r.sourceEntityId === ip.id || r.targetEntityId === ip.id)
      .map((r) =>
        r.sourceEntityId === ip.id
          ? r.targetEntity.normalizedValue
          : r.sourceEntity.normalizedValue
      );
    ipDeviceClusters.push({
      key: ip.normalizedValue,
      type: "IP",
      linkedValues: [...new Set(linked)],
      entityIds: [ip.id],
      reason:
        linked.length > 0
          ? `IP ${ip.normalizedValue} linked to ${linked.length} entit(y/ies)`
          : `IP entity ${ip.normalizedValue} observed in evidence`,
    });
  }

  for (const dev of byDevice) {
    const linked = relationships
      .filter((r) => r.sourceEntityId === dev.id || r.targetEntityId === dev.id)
      .map((r) =>
        r.sourceEntityId === dev.id
          ? r.targetEntity.normalizedValue
          : r.sourceEntity.normalizedValue
      );
    // Also phones sharing this IMEI from CDR
    const cdrPhones = [...phoneImeis.entries()]
      .filter(([, imeis]) => imeis.has(dev.normalizedValue) || [...imeis].some((i) => i === dev.normalizedValue))
      .map(([p]) => p);
    const allLinked = [...new Set([...linked, ...cdrPhones])];
    ipDeviceClusters.push({
      key: dev.normalizedValue,
      type: "DEVICE",
      linkedValues: allLinked,
      entityIds: [dev.id],
      reason:
        allLinked.length > 1
          ? `Device ${dev.normalizedValue} clusters ${allLinked.length} linked values`
          : `Device entity ${dev.normalizedValue} present`,
    });
  }

  // --- Crypto hops ---
  const cryptoHops: CryptoHop[] = [];
  const wallets = entities.filter((e) => String(e.type) === "CRYPTO_WALLET");
  const moneyTypes = new Set(["UPI", "BANK_ACCOUNT", "PHONE"]);
  for (const w of wallets) {
    const linkedAccounts: string[] = [];
    let hops = 0;
    for (const r of relationships) {
      const touch =
        r.sourceEntityId === w.id ||
        r.targetEntityId === w.id ||
        r.sourceEntity.normalizedValue === w.normalizedValue ||
        r.targetEntity.normalizedValue === w.normalizedValue;
      if (!touch) continue;
      hops++;
      const other =
        String(r.sourceEntity.type) === "CRYPTO_WALLET"
          ? r.targetEntity
          : String(r.targetEntity.type) === "CRYPTO_WALLET"
            ? r.sourceEntity
            : r.sourceEntityId === w.id
              ? r.targetEntity
              : r.sourceEntity;
      if (moneyTypes.has(other.type) || String(other.type) === "CRYPTO_WALLET") {
        linkedAccounts.push(`${other.type}:${other.normalizedValue}`);
      }
    }
    cryptoHops.push({
      wallet: w.normalizedValue,
      linkedAccounts: [...new Set(linkedAccounts)],
      hopCount: Math.max(hops, linkedAccounts.length),
      reason:
        linkedAccounts.length > 0
          ? `Wallet ${w.normalizedValue} bridged to ${linkedAccounts.length} account(s)/wallet(s)`
          : `Crypto wallet entity observed; no bank/UPI bridge relationship yet`,
    });
  }

  return {
    muleSignals,
    simSwapSuspects: simSwapSuspects.sort((a, b) => b.confidence - a.confidence),
    phishingUrls,
    emailIntel,
    ipDeviceClusters,
    cryptoHops,
    computedAt: new Date().toISOString(),
  };
}

export async function createCyberAlerts(caseId: string): Promise<number> {
  const intel = await analyzeCyberIntel(caseId);
  let created = 0;

  async function createIfNew(
    type: "TRANSACTION_ANOMALY" | "COMMUNICATION_BURST" | "ENTITY_MATCH" | "INTEGRITY_MISMATCH",
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

  for (const m of intel.muleSignals.filter((x) => x.severity === "HIGH" || x.severity === "CRITICAL").slice(0, 8)) {
    await createIfNew(
      "TRANSACTION_ANOMALY",
      `Cyber mule signal: ${m.account}`,
      `Mule/risk factors: ${m.factors.join("; ")}. Review recommended.`,
      Math.min(m.score / 100, 0.95),
      { kind: "MULE", account: m.account, score: m.score, severity: m.severity }
    );
  }

  for (const s of intel.simSwapSuspects.slice(0, 8)) {
    await createIfNew(
      "COMMUNICATION_BURST",
      `SIM/device change suspect: ${s.phone}`,
      s.reason,
      s.confidence,
      { kind: "SIM_SWAP", phone: s.phone, imeis: s.imeis, nearTxnWindow: s.nearTxnWindow }
    );
  }

  for (const p of intel.phishingUrls.filter((x) => x.riskHints.length > 0).slice(0, 8)) {
    await createIfNew(
      "ENTITY_MATCH",
      `Phishing URL/domain: ${String(p.value ?? "").slice(0, 80)}`,
      `Risk hints: ${p.riskHints.join("; ")}. Source: ${p.source}. Review recommended.`,
      0.7,
      { kind: "PHISHING", value: p.value, riskHints: p.riskHints, source: p.source }
    );
  }

  for (const c of intel.cryptoHops.filter((x) => x.hopCount > 0 || x.linkedAccounts.length > 0).slice(0, 5)) {
    await createIfNew(
      "TRANSACTION_ANOMALY",
      `Crypto bridge: ${String(c.wallet ?? "").slice(0, 24)}…`,
      c.reason,
      0.75,
      { kind: "CRYPTO_HOP", wallet: c.wallet, linkedAccounts: c.linkedAccounts, hopCount: c.hopCount }
    );
  }

  for (const cluster of intel.ipDeviceClusters.filter((x) => x.linkedValues.length >= 2).slice(0, 5)) {
    await createIfNew(
      "ENTITY_MATCH",
      `IP/device cluster: ${cluster.key}`,
      cluster.reason,
      0.72,
      { kind: "IP_DEVICE", key: cluster.key, type: cluster.type, linkedValues: cluster.linkedValues }
    );
  }

  return created;
}
