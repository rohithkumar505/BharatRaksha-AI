import { prisma } from "./db";
import { decryptPii } from "./pii-crypto";
import type { Transaction } from "@bharat-raksha/database";

export const SMURF_THRESHOLD_INR = 10_000;
export const HIGH_VALUE_THRESHOLD_INR = 100_000;
export const STRUCTURING_NEAR_THRESHOLD_INR = 49_000;
export const RAPID_MOVEMENT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const MIN_FAN_COUNTERPARTIES = 3;

export interface TxnEdge {
  id: string;
  sender: string;
  receiver: string;
  amount: number;
  timestamp: Date;
  bank?: string | null;
  upiId?: string | null;
  evidenceId?: string | null;
}

export interface FanPattern {
  account: string;
  type: "FAN_OUT" | "FAN_IN";
  uniqueCounterparties: number;
  transactionCount: number;
  totalAmount: number;
  counterparties: string[];
  reason: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface CircularFlow {
  cycle: string[];
  hops: number;
  totalAmount: number;
  timestamps: string[];
  reason: string;
  severity: "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface RapidMovement {
  path: string[];
  hops: number;
  timeSpanMinutes: number;
  totalAmount: number;
  startTime: string;
  endTime: string;
  reason: string;
  severity: "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface SmurfingPattern {
  account: string;
  subThresholdCount: number;
  structuringCount: number;
  totalSmurfed: number;
  avgAmount: number;
  reason: string;
  severity: "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface SuspiciousScore {
  account: string;
  score: number;
  factors: string[];
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  totalIn: number;
  totalOut: number;
  transactionCount: number;
}

export interface FinancialSubgraph {
  nodes: Array<{ id: string; label: string; value: string; type: string }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    amount: number;
    weight: number;
    timestamp: string;
  }>;
}

export interface FinancialAnalysisResult {
  summary: {
    totalTransactions: number;
    totalVolume: number;
    uniqueAccounts: number;
    highValueCount: number;
    averageAmount: number;
    dateRange: { from: string | null; to: string | null };
  };
  fanOut: FanPattern[];
  fanIn: FanPattern[];
  circularFlows: CircularFlow[];
  rapidMovements: RapidMovement[];
  smurfing: SmurfingPattern[];
  suspiciousScores: SuspiciousScore[];
  highValueTransactions: Array<{
    sender: string;
    receiver: string;
    amount: number;
    timestamp: string;
    bank?: string | null;
  }>;
  filteredTransactions: Array<{
    sender: string;
    receiver: string;
    amount: number;
    timestamp: string;
  }>;
  subgraph: FinancialSubgraph;
  flows: Array<{ from: string; to: string; amount: number; timestamp: string }>;
  computedAt: string;
}

function toTxnEdge(t: Transaction): TxnEdge {
  return {
    id: t.id,
    sender: decryptPii(t.sender),
    receiver: decryptPii(t.receiver),
    amount: Number(t.amount),
    timestamp: t.timestamp,
    bank: t.bank,
    upiId: t.upiId,
    evidenceId: t.evidenceId,
  };
}

function severityFromScore(score: number): SuspiciousScore["severity"] {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

/** G2: Fan-out — one account → many recipients */
export function detectFanOut(txns: TxnEdge[]): FanPattern[] {
  const bySender = new Map<string, { receivers: Set<string>; count: number; total: number }>();

  for (const t of txns) {
    if (!bySender.has(t.sender)) {
      bySender.set(t.sender, { receivers: new Set(), count: 0, total: 0 });
    }
    const s = bySender.get(t.sender)!;
    s.receivers.add(t.receiver);
    s.count++;
    s.total += t.amount;
  }

  return [...bySender.entries()]
    .filter(([, v]) => v.receivers.size >= MIN_FAN_COUNTERPARTIES)
    .map(([account, v]) => {
      const severity: FanPattern["severity"] =
        v.receivers.size >= 8 ? "CRITICAL" : v.receivers.size >= 5 ? "HIGH" : "MEDIUM";
      return {
        account,
        type: "FAN_OUT" as const,
        uniqueCounterparties: v.receivers.size,
        transactionCount: v.count,
        totalAmount: Math.round(v.total),
        counterparties: [...v.receivers].slice(0, 10),
        reason: `Fan-out: ${account} sent to ${v.receivers.size} unique accounts (₹${v.total.toLocaleString("en-IN")} total). Possible layering/distribution.`,
        severity,
      };
    })
    .sort((a, b) => b.uniqueCounterparties - a.uniqueCounterparties);
}

/** G2: Fan-in — many senders → one account */
export function detectFanIn(txns: TxnEdge[]): FanPattern[] {
  const byReceiver = new Map<string, { senders: Set<string>; count: number; total: number }>();

  for (const t of txns) {
    if (!byReceiver.has(t.receiver)) {
      byReceiver.set(t.receiver, { senders: new Set(), count: 0, total: 0 });
    }
    const r = byReceiver.get(t.receiver)!;
    r.senders.add(t.sender);
    r.count++;
    r.total += t.amount;
  }

  return [...byReceiver.entries()]
    .filter(([, v]) => v.senders.size >= MIN_FAN_COUNTERPARTIES)
    .map(([account, v]) => {
      const severity: FanPattern["severity"] =
        v.senders.size >= 8 ? "CRITICAL" : v.senders.size >= 5 ? "HIGH" : "MEDIUM";
      return {
        account,
        type: "FAN_IN" as const,
        uniqueCounterparties: v.senders.size,
        transactionCount: v.count,
        totalAmount: Math.round(v.total),
        counterparties: [...v.senders].slice(0, 10),
        reason: `Fan-in: ${account} received from ${v.senders.size} unique accounts (₹${v.total.toLocaleString("en-IN")} total). Possible aggregation/mule hub.`,
        severity,
      };
    })
    .sort((a, b) => b.uniqueCounterparties - a.uniqueCounterparties);
}

/** G3: Circular money flow — cycles of length 3–5 (DFS) */
export function detectCircularFlows(txns: TxnEdge[], maxCycleLen = 5): CircularFlow[] {
  const adj = new Map<string, Array<{ to: string; amount: number; timestamp: Date }>>();
  for (const t of txns) {
    if (!adj.has(t.sender)) adj.set(t.sender, []);
    adj.get(t.sender)!.push({ to: t.receiver, amount: t.amount, timestamp: t.timestamp });
  }

  const cycles: CircularFlow[] = [];
  const seenCycles = new Set<string>();

  function normalizeCycle(path: string[]): string {
    const minIdx = path.reduce((best, n, i) => (n < path[best] ? i : best), 0);
    const rotated = [...path.slice(minIdx), ...path.slice(0, minIdx)];
    return rotated.join("→");
  }

  function dfs(start: string, current: string, path: string[], amounts: number[], times: Date[], visited: Set<string>) {
    if (path.length > maxCycleLen) return;

    const edges = adj.get(current) ?? [];
    for (const edge of edges) {
      if (edge.to === start && path.length >= 2) {
        const cycle = [...path, start];
        const key = normalizeCycle(cycle.slice(0, -1));
        if (!seenCycles.has(key)) {
          seenCycles.add(key);
          const totalAmount = amounts.reduce((s, a) => s + a, 0) + edge.amount;
          cycles.push({
            cycle,
            hops: cycle.length - 1,
            totalAmount: Math.round(totalAmount),
            timestamps: [...times, edge.timestamp].map((d) => d.toISOString()),
            reason: `Circular flow detected: ${cycle.join(" → ")}. Funds routed back — review for layering/wash trading.`,
            severity: cycle.length >= 5 ? "CRITICAL" : cycle.length >= 4 ? "HIGH" : "MEDIUM",
          });
        }
        continue;
      }

      if (visited.has(edge.to) || path.includes(edge.to)) continue;

      visited.add(edge.to);
      dfs(start, edge.to, [...path, edge.to], [...amounts, edge.amount], [...times, edge.timestamp], visited);
      visited.delete(edge.to);
    }
  }

  for (const node of adj.keys()) {
    dfs(node, node, [node], [], [], new Set([node]));
  }

  return cycles.sort((a, b) => b.hops - a.hops).slice(0, 20);
}

/** G4: Rapid movement — multi-hop chain within time window */
export function detectRapidMovement(txns: TxnEdge[], windowMs = RAPID_MOVEMENT_WINDOW_MS): RapidMovement[] {
  const sorted = [...txns].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const movements: RapidMovement[] = [];
  const seen = new Set<string>();

  const adjByTime = new Map<string, TxnEdge[]>();
  for (const t of sorted) {
    if (!adjByTime.has(t.sender)) adjByTime.set(t.sender, []);
    adjByTime.get(t.sender)!.push(t);
  }

  function explore(path: string[], edges: TxnEdge[], startTime: number) {
    if (edges.length >= 2) {
      const last = edges[edges.length - 1];
      const spanMs = last.timestamp.getTime() - startTime;
      if (spanMs <= windowMs && spanMs > 0) {
        const key = path.join("→");
        if (!seen.has(key)) {
          seen.add(key);
          const totalAmount = edges.reduce((s, e) => s + e.amount, 0);
          movements.push({
            path,
            hops: edges.length,
            timeSpanMinutes: Math.round(spanMs / 60000),
            totalAmount: Math.round(totalAmount),
            startTime: edges[0].timestamp.toISOString(),
            endTime: last.timestamp.toISOString(),
            reason: `Rapid movement: ${path.join(" → ")} — ${edges.length} hops in ${Math.round(spanMs / 60000)} min (₹${totalAmount.toLocaleString("en-IN")}). Possible layering.`,
            severity: edges.length >= 4 ? "CRITICAL" : edges.length >= 3 ? "HIGH" : "MEDIUM",
          });
        }
      }
    }

    if (path.length >= 6) return;

    const lastNode = path[path.length - 1];
    const lastTime = edges.length > 0 ? edges[edges.length - 1].timestamp.getTime() : startTime;
    const nextEdges = (adjByTime.get(lastNode) ?? []).filter(
      (e) => e.timestamp.getTime() >= lastTime && e.timestamp.getTime() - startTime <= windowMs
    );

    for (const e of nextEdges) {
      if (path.includes(e.receiver)) continue;
      explore([...path, e.receiver], [...edges, e], startTime);
    }
  }

  for (const t of sorted) {
    explore([t.sender, t.receiver], [t], t.timestamp.getTime());
  }

  return movements.sort((a, b) => b.hops - a.hops || a.timeSpanMinutes - b.timeSpanMinutes).slice(0, 15);
}

/** G5: Smurfing / structuring — sub-threshold splits + near ₹50K structuring */
export function detectSmurfing(txns: TxnEdge[]): SmurfingPattern[] {
  const bySender = new Map<
    string,
    { subThreshold: TxnEdge[]; structuring: TxnEdge[] }
  >();

  for (const t of txns) {
    if (!bySender.has(t.sender)) bySender.set(t.sender, { subThreshold: [], structuring: [] });
    const s = bySender.get(t.sender)!;
    if (t.amount > 0 && t.amount < SMURF_THRESHOLD_INR) s.subThreshold.push(t);
    if (t.amount >= STRUCTURING_NEAR_THRESHOLD_INR && t.amount < HIGH_VALUE_THRESHOLD_INR) {
      s.structuring.push(t);
    }
  }

  const patterns: SmurfingPattern[] = [];

  for (const [account, data] of bySender) {
    const subCount = data.subThreshold.length;
    const structCount = data.structuring.length;
    if (subCount < 3 && structCount < 2) continue;

    const totalSmurfed = data.subThreshold.reduce((s, t) => s + t.amount, 0);
    const avgAmount = subCount > 0 ? totalSmurfed / subCount : 0;

    let severity: SmurfingPattern["severity"] = "MEDIUM";
    if (subCount >= 10 || structCount >= 3) severity = "CRITICAL";
    else if (subCount >= 6 || structCount >= 2) severity = "HIGH";

    const parts: string[] = [];
    if (subCount >= 3) parts.push(`${subCount} sub-₹${SMURF_THRESHOLD_INR.toLocaleString("en-IN")} transactions`);
    if (structCount >= 2) parts.push(`${structCount} near-threshold (₹49K–₹1L) splits`);

    patterns.push({
      account,
      subThresholdCount: subCount,
      structuringCount: structCount,
      totalSmurfed: Math.round(totalSmurfed),
      avgAmount: Math.round(avgAmount),
      reason: `Structuring/smurfing from ${account}: ${parts.join("; ")}. Review recommended — possible CTR/STR evasion.`,
      severity,
    });
  }

  return patterns.sort((a, b) => b.subThresholdCount - a.subThresholdCount);
}

/** G6: Explainable suspicious transaction score per account */
export function computeSuspiciousScores(
  txns: TxnEdge[],
  fanOut: FanPattern[],
  fanIn: FanPattern[],
  circular: CircularFlow[],
  rapid: RapidMovement[],
  smurfing: SmurfingPattern[]
): SuspiciousScore[] {
  const activity = new Map<string, { in: number; out: number; count: number }>();

  for (const t of txns) {
    for (const acc of [t.sender, t.receiver]) {
      if (!activity.has(acc)) activity.set(acc, { in: 0, out: 0, count: 0 });
    }
    activity.get(t.sender)!.out += t.amount;
    activity.get(t.sender)!.count++;
    activity.get(t.receiver)!.in += t.amount;
    activity.get(t.receiver)!.count++;
  }

  const scoreMap = new Map<string, { score: number; factors: string[] }>();

  function addScore(account: string, points: number, factor: string) {
    const existing = scoreMap.get(account) ?? { score: 0, factors: [] };
    existing.score += points;
    if (!existing.factors.includes(factor)) existing.factors.push(factor);
    scoreMap.set(account, existing);
  }

  for (const f of fanOut) addScore(f.account, 25, `Fan-out hub: ${f.uniqueCounterparties} recipients`);
  for (const f of fanIn) addScore(f.account, 25, `Fan-in hub: ${f.uniqueCounterparties} senders`);
  for (const c of circular) {
    for (const acc of c.cycle) addScore(acc, 30, `In circular flow (${c.hops}-hop cycle)`);
  }
  for (const r of rapid) {
    for (const acc of r.path) addScore(acc, 20, `Rapid movement chain (${r.hops} hops in ${r.timeSpanMinutes}min)`);
  }
  for (const s of smurfing) addScore(s.account, 35, `Smurfing/structuring: ${s.subThresholdCount} sub-threshold txns`);

  for (const [account, act] of activity) {
    if (act.count >= 10) addScore(account, 10, `High velocity: ${act.count} transactions`);
    if (act.in > 0 && act.out > 0) {
      const ratio = Math.min(act.in, act.out) / Math.max(act.in, act.out);
      if (ratio > 0.8 && act.count >= 4) {
        addScore(account, 15, "Pass-through pattern: balanced in/out flow");
      }
    }
  }

  return [...scoreMap.entries()]
    .map(([account, { score, factors }]) => {
      const act = activity.get(account)!;
      return {
        account,
        score: Math.min(Math.round(score * 10) / 10, 100),
        factors,
        severity: severityFromScore(score),
        totalIn: Math.round(act.in),
        totalOut: Math.round(act.out),
        transactionCount: act.count,
      };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

/** G1: Transaction flow graph for visualization */
export function buildFinancialSubgraph(txns: TxnEdge[]): FinancialSubgraph {
  const nodes = new Map<string, { id: string; value: string; type: string }>();
  const edgeMap = new Map<
    string,
    { source: string; target: string; amount: number; count: number; lastTime: Date }
  >();

  function ensureNode(account: string) {
    if (!nodes.has(account)) {
      const type = account.includes("@") ? "Upi" : "BankAccount";
      nodes.set(account, { id: `acct:${account}`, value: account, type });
    }
  }

  for (const t of txns) {
    ensureNode(t.sender);
    ensureNode(t.receiver);
    const key = `${t.sender}|${t.receiver}`;
    const existing = edgeMap.get(key);
    if (existing) {
      existing.amount += t.amount;
      existing.count++;
      if (t.timestamp > existing.lastTime) existing.lastTime = t.timestamp;
    } else {
      edgeMap.set(key, {
        source: t.sender,
        target: t.receiver,
        amount: t.amount,
        count: 1,
        lastTime: t.timestamp,
      });
    }
  }

  return {
    nodes: [...nodes.values()].map((n) => ({ ...n, label: n.type })),
    edges: [...edgeMap.entries()].map(([key, e]) => ({
      id: `txn-edge:${key}`,
      source: `acct:${e.source}`,
      target: `acct:${e.target}`,
      type: "TRANSFERRED",
      amount: Math.round(e.amount),
      weight: e.count,
      timestamp: e.lastTime.toISOString(),
    })),
  };
}

/** G7: Filter transactions by minimum amount */
export function filterByAmount(txns: TxnEdge[], minAmount: number): TxnEdge[] {
  return txns.filter((t) => t.amount >= minAmount);
}

export async function analyzeFinancialForCase(
  caseId: string,
  options?: { minAmount?: number }
): Promise<FinancialAnalysisResult> {
  const records = await prisma.transaction.findMany({
    where: { caseId },
    orderBy: { timestamp: "asc" },
  });

  const txns = records.map(toTxnEdge);
  const minAmount = options?.minAmount ?? 0;
  const filtered = minAmount > 0 ? filterByAmount(txns, minAmount) : txns;

  const accounts = new Set<string>();
  let totalVolume = 0;
  for (const t of txns) {
    accounts.add(t.sender);
    accounts.add(t.receiver);
    totalVolume += t.amount;
  }

  const highValue = txns.filter((t) => t.amount >= HIGH_VALUE_THRESHOLD_INR);

  const fanOut = detectFanOut(txns);
  const fanIn = detectFanIn(txns);
  const circularFlows = detectCircularFlows(txns);
  const rapidMovements = detectRapidMovement(txns);
  const smurfing = detectSmurfing(txns);
  const suspiciousScores = computeSuspiciousScores(
    txns,
    fanOut,
    fanIn,
    circularFlows,
    rapidMovements,
    smurfing
  );

  return {
    summary: {
      totalTransactions: txns.length,
      totalVolume: Math.round(totalVolume),
      uniqueAccounts: accounts.size,
      highValueCount: highValue.length,
      averageAmount: txns.length ? Math.round(totalVolume / txns.length) : 0,
      dateRange: {
        from: records[0]?.timestamp.toISOString() ?? null,
        to: records[records.length - 1]?.timestamp.toISOString() ?? null,
      },
    },
    fanOut,
    fanIn,
    circularFlows,
    rapidMovements,
    smurfing,
    suspiciousScores,
    highValueTransactions: highValue.map((t) => ({
      sender: t.sender,
      receiver: t.receiver,
      amount: t.amount,
      timestamp: t.timestamp.toISOString(),
      bank: t.bank,
    })),
    filteredTransactions: filtered.map((t) => ({
      sender: t.sender,
      receiver: t.receiver,
      amount: t.amount,
      timestamp: t.timestamp.toISOString(),
    })),
    subgraph: buildFinancialSubgraph(txns),
    flows: txns.map((t) => ({
      from: t.sender,
      to: t.receiver,
      amount: t.amount,
      timestamp: t.timestamp.toISOString(),
    })),
    computedAt: new Date().toISOString(),
  };
}

/** Create TRANSACTION_ANOMALY alerts from analysis */
export async function createFinancialAlerts(caseId: string): Promise<number> {
  const analysis = await analyzeFinancialForCase(caseId);
  let created = 0;

  async function createAlertIfNew(
    title: string,
    message: string,
    confidence: number,
    metadata: Record<string, unknown>
  ) {
    const existing = await prisma.alert.findFirst({
      where: {
        caseId,
        type: "TRANSACTION_ANOMALY",
        title,
        status: { in: ["NEW", "ACKNOWLEDGED", "INVESTIGATING"] },
      },
    });
    if (existing) return;
    await prisma.alert.create({
      data: {
        type: "TRANSACTION_ANOMALY",
        title,
        message,
        confidence,
        caseId,
        metadata: metadata as object,
      },
    });
    created++;
  }

  for (const c of analysis.circularFlows.slice(0, 5)) {
    await createAlertIfNew(
      `Circular flow: ${c.cycle.slice(0, 3).join("→")}...`,
      c.reason,
      0.9,
      { cycle: c.cycle, hops: c.hops, totalAmount: c.totalAmount }
    );
  }

  for (const s of analysis.smurfing.slice(0, 5)) {
    await createAlertIfNew(
      `Smurfing/structuring: ${s.account}`,
      s.reason,
      0.85,
      { account: s.account, subThresholdCount: s.subThresholdCount, structuringCount: s.structuringCount }
    );
  }

  for (const r of analysis.rapidMovements.slice(0, 5)) {
    await createAlertIfNew(
      `Rapid movement: ${r.path[0]}→${r.path[r.path.length - 1]}`,
      r.reason,
      0.88,
      { path: r.path, hops: r.hops, timeSpanMinutes: r.timeSpanMinutes }
    );
  }

  for (const f of [...analysis.fanOut, ...analysis.fanIn].slice(0, 5)) {
    await createAlertIfNew(
      `${f.type === "FAN_OUT" ? "Fan-out" : "Fan-in"}: ${f.account}`,
      f.reason,
      0.8,
      { account: f.account, type: f.type, counterparties: f.uniqueCounterparties }
    );
  }

  for (const score of analysis.suspiciousScores.filter((s) => s.severity === "CRITICAL" || s.severity === "HIGH").slice(0, 3)) {
    await createAlertIfNew(
      `High-risk account: ${score.account} (score ${score.score})`,
      `Suspicious activity indicators: ${score.factors.join("; ")}. Review recommended.`,
      Math.min(score.score / 100, 0.95),
      { account: score.account, score: score.score, factors: score.factors }
    );
  }

  return created;
}
