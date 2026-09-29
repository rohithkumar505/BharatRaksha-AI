import { prisma } from "./db";
import { getRedis } from "./redis";
import { getFullGraphAnalytics, findCrossCaseLinks } from "./graph-analytics";
import { analyzeCdrForCase } from "./cdr-intelligence";
import { analyzeFinancialForCase } from "./financial-intelligence";
import { getUnifiedTimeline } from "./geo-intelligence";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8001";
const EMBED_CACHE_TTL = 60 * 60 * 24 * 7; // 7 days

export type CopilotIntent =
  | "SUMMARY"
  | "ENTITY_IMPORTANCE"
  | "CROSS_CASE"
  | "FINANCIAL"
  | "COMMUNICATION"
  | "GEO_TIMELINE"
  | "EVIDENCE_SEARCH"
  | "ALERTS"
  | "GENERAL";

export interface CopilotSource {
  type: string;
  ref: string;
  evidenceId?: string;
  recordRef?: string;
  confidence: number;
  excerpt?: string;
}

export interface RetrievedChunk {
  id: string;
  content: string;
  chunkType: string;
  sourceType: string;
  sourceId?: string | null;
  evidenceId?: string | null;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface CopilotResponse {
  answer: string;
  intent: CopilotIntent;
  sources: CopilotSource[];
  chunks: RetrievedChunk[];
  structuredFacts: Record<string, unknown>;
  computedAt: string;
}

interface ChunkInput {
  content: string;
  chunkType: string;
  sourceType: string;
  sourceId?: string;
  evidenceId?: string;
  metadata?: Record<string, unknown>;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "dare",
  "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by",
  "from", "as", "into", "through", "during", "before", "after", "above",
  "below", "between", "under", "again", "further", "then", "once", "here",
  "there", "when", "where", "why", "how", "all", "each", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "just", "and", "but", "if", "or",
  "because", "until", "while", "this", "that", "these", "those", "what",
  "which", "who", "whom", "whose", "about", "against", "between", "into",
  "who", "whom", "whose", "show", "tell", "explain", "find", "list",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9@._\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

export function classifyIntent(query: string): CopilotIntent {
  const q = query.toLowerCase();

  if (
    (q.includes("connect") || q.includes("link") || q.includes("relation")) &&
    (q.includes("case") || q.includes("cases") || q.includes("cross"))
  ) {
    return "CROSS_CASE";
  }
  if (
    q.includes("summar") ||
    q.includes("overview") ||
    q.includes("brief") ||
    q.includes("status of case")
  ) {
    return "SUMMARY";
  }
  if (
    q.includes("important") ||
    q.includes("centrality") ||
    q.includes("connected") ||
    q.includes("bridge") ||
    q.includes("key player") ||
    q.includes("why is") ||
    q.includes("who is")
  ) {
    return "ENTITY_IMPORTANCE";
  }
  if (
    q.includes("financial") ||
    q.includes("money") ||
    q.includes("transaction") ||
    q.includes("transfer") ||
    q.includes("aml") ||
    q.includes("smurf") ||
    q.includes("circular")
  ) {
    return "FINANCIAL";
  }
  if (
    q.includes("call") ||
    q.includes("cdr") ||
    q.includes("communication") ||
    q.includes("phone") ||
    q.includes("contact") ||
    q.includes("burst")
  ) {
    return "COMMUNICATION";
  }
  if (
    q.includes("location") ||
    q.includes("map") ||
    q.includes("timeline") ||
    q.includes("movement") ||
    q.includes("where") ||
    q.includes("geo")
  ) {
    return "GEO_TIMELINE";
  }
  if (
    q.includes("alert") ||
    q.includes("anomal") ||
    q.includes("suspicious") ||
    q.includes("flag")
  ) {
    return "ALERTS";
  }
  if (
    q.includes("evidence") ||
    q.includes("fir") ||
    q.includes("document") ||
    q.includes("upload")
  ) {
    return "EVIDENCE_SEARCH";
  }
  return "GENERAL";
}

function extractEntityHint(query: string): string | null {
  const patterns = [
    /(?:why is|who is|importance of|about)\s+([a-z0-9@._-]+)/i,
    /(?:entity|person|phone|account)\s+([a-z0-9@._-]+)/i,
    /(\d{10})/,
    /([a-z0-9._-]+@[a-z0-9.-]+)/i,
  ];
  for (const p of patterns) {
    const m = query.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function extractCaseNumbers(query: string): string[] {
  const matches = query.match(/CASE-\d{4}-\d+/gi) ?? [];
  return [...new Set(matches.map((m) => m.toUpperCase()))];
}

export function bm25Score(
  queryTokens: string[],
  docTokens: string[],
  avgDocLen: number,
  docFreq: Map<string, number>,
  totalDocs: number,
  k1 = 1.5,
  b = 0.75
): number {
  const tf = new Map<string, number>();
  for (const t of docTokens) tf.set(t, (tf.get(t) ?? 0) + 1);

  let score = 0;
  const docLen = docTokens.length || 1;

  for (const term of queryTokens) {
    const freq = tf.get(term) ?? 0;
    if (freq === 0) continue;
    const df = docFreq.get(term) ?? 0;
    const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
    const numerator = freq * (k1 + 1);
    const denominator = freq + k1 * (1 - b + b * (docLen / avgDocLen));
    score += idf * (numerator / denominator);
  }
  return score;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function embedText(text: string): Promise<number[] | null> {
  const cacheKey = `embed:${text.slice(0, 200)}`;
  try {
    const redis = getRedis();
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // optional cache
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: text.slice(0, 8000),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        const vec = data.data?.[0]?.embedding as number[];
        if (vec) {
          try {
            const redis = getRedis();
            await redis.setex(cacheKey, EMBED_CACHE_TTL, JSON.stringify(vec));
          } catch {
            // ignore
          }
          return vec;
        }
      }
    } catch {
      // fall through
    }
  }

  try {
    const res = await fetch(`${AI_SERVICE_URL}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = await res.json();
      const vec = data.embedding as number[];
      if (vec?.length) {
        try {
          const redis = getRedis();
          await redis.setex(cacheKey, EMBED_CACHE_TTL, JSON.stringify(vec));
        } catch {
          // ignore
        }
        return vec;
      }
    }
  } catch {
    // fall through
  }

  return null;
}

function rrfFuse(
  rankings: Array<Array<{ id: string; rank: number }>>,
  k = 60
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    for (const { id, rank } of ranking) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    }
  }
  return scores;
}

export async function hybridRetrieve(
  caseId: string,
  query: string,
  topK = 8
): Promise<RetrievedChunk[]> {
  const chunks = await prisma.caseKnowledgeChunk.findMany({
    where: { caseId },
  });
  if (chunks.length === 0) return [];

  const queryTokens = tokenize(query);
  const allDocTokens = chunks.map((c) => tokenize(c.content));
  const avgDocLen =
    allDocTokens.reduce((s, d) => s + d.length, 0) / (allDocTokens.length || 1);

  const docFreq = new Map<string, number>();
  for (const tokens of allDocTokens) {
    const seen = new Set(tokens);
    for (const t of seen) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  }

  const bm25Ranking = chunks
    .map((c, i) => ({
      id: c.id,
      score: bm25Score(queryTokens, allDocTokens[i], avgDocLen, docFreq, chunks.length),
    }))
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ id: r.id, rank: i + 1, score: r.score }));

  const queryEmbedding = await embedText(query);
  let denseRanking: Array<{ id: string; rank: number; score: number }> = [];

  if (queryEmbedding) {
    denseRanking = chunks
      .map((c) => {
        const emb = c.embedding as number[] | null;
        const score = emb?.length ? cosineSimilarity(queryEmbedding, emb) : 0;
        return { id: c.id, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ id: r.id, rank: i + 1, score: r.score }));
  }

  const fused = rrfFuse([
    bm25Ranking.map(({ id, rank }) => ({ id, rank })),
    denseRanking.length > 0 ? denseRanking.map(({ id, rank }) => ({ id, rank })) : [],
  ]);

  const bm25Map = new Map(bm25Ranking.map((r) => [r.id, r.score]));

  return chunks
    .map((c) => ({
      id: c.id,
      content: c.content,
      chunkType: c.chunkType,
      sourceType: c.sourceType,
      sourceId: c.sourceId,
      evidenceId: c.evidenceId,
      score: fused.get(c.id) ?? 0,
      bm25: bm25Map.get(c.id) ?? 0,
      metadata: (c.metadata as Record<string, unknown>) ?? {},
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function chunkKeywords(content: string): string[] {
  return [...new Set(tokenize(content))].slice(0, 40);
}

export async function indexCaseKnowledge(caseId: string): Promise<number> {
  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      evidence: true,
      entities: { where: { mergedIntoId: null }, take: 200 },
      alerts: { take: 50, orderBy: { createdAt: "desc" } },
      notes: { take: 30, orderBy: { createdAt: "desc" }, include: { author: true } },
      cdrRecords: { take: 100, orderBy: { timestamp: "desc" } },
      transactions: { take: 100, orderBy: { timestamp: "desc" } },
      locations: { take: 50, orderBy: { timestamp: "desc" } },
    },
  });

  if (!caseData) return 0;

  await prisma.caseKnowledgeChunk.deleteMany({ where: { caseId } });

  const inputs: ChunkInput[] = [];

  inputs.push({
    content: `Case ${caseData.caseNumber}: ${caseData.crimeType}. Status: ${caseData.status}. Priority: ${caseData.priority}. Location: ${caseData.location ?? "unknown"}. ${caseData.description ?? ""}`,
    chunkType: "case_summary",
    sourceType: "case",
    sourceId: caseId,
    metadata: { caseNumber: caseData.caseNumber },
  });

  for (const e of caseData.evidence) {
    inputs.push({
      content: `Evidence file: ${e.fileName} (type: ${e.type}, status: ${e.ingestionStatus}, hash: ${String(e.sha256Hash ?? "").slice(0, 16)}...)`,
      chunkType: "evidence",
      sourceType: "evidence",
      sourceId: e.id,
      evidenceId: e.id,
      metadata: { fileName: e.fileName, type: e.type },
    });
  }

  for (const ent of caseData.entities) {
    inputs.push({
      content: `Entity ${ent.type}: ${ent.normalizedValue} (confidence: ${Math.round(ent.confidence * 100)}%)`,
      chunkType: "entity",
      sourceType: "entity",
      sourceId: ent.id,
      evidenceId: ent.evidenceId ?? undefined,
      metadata: { type: ent.type, value: ent.normalizedValue },
    });
  }

  for (const cdr of caseData.cdrRecords) {
    inputs.push({
      content: `CDR: ${cdr.caller} called ${cdr.receiver} at ${cdr.timestamp.toISOString()} for ${cdr.duration}s${cdr.location ? ` from ${cdr.location}` : ""}`,
      chunkType: "cdr",
      sourceType: "cdr",
      sourceId: cdr.id,
      evidenceId: cdr.evidenceId ?? undefined,
      metadata: { caller: cdr.caller, receiver: cdr.receiver },
    });
  }

  for (const txn of caseData.transactions) {
    inputs.push({
      content: `Transaction: ₹${Number(txn.amount).toLocaleString("en-IN")} from ${txn.sender} to ${txn.receiver} at ${txn.timestamp.toISOString()}`,
      chunkType: "transaction",
      sourceType: "transaction",
      sourceId: txn.id,
      evidenceId: txn.evidenceId ?? undefined,
      metadata: { sender: txn.sender, receiver: txn.receiver, amount: Number(txn.amount) },
    });
  }

  for (const alert of caseData.alerts) {
    inputs.push({
      content: `Alert [${alert.type}]: ${alert.title}. ${alert.message} (confidence: ${Math.round((alert.confidence ?? 0) * 100)}%)`,
      chunkType: "alert",
      sourceType: "alert",
      sourceId: alert.id,
      metadata: { alertType: alert.type },
    });
  }

  for (const note of caseData.notes) {
    inputs.push({
      content: `Investigator note by ${note.author.name}: ${note.content}`,
      chunkType: "note",
      sourceType: "note",
      sourceId: note.id,
      metadata: { author: note.author.name },
    });
  }

  for (const loc of caseData.locations) {
    inputs.push({
      content: `Location: ${loc.entityRef ?? "unknown"} at ${loc.towerId ?? loc.address ?? `${loc.latitude},${loc.longitude}`} on ${loc.timestamp.toISOString()}`,
      chunkType: "location",
      sourceType: "location",
      sourceId: loc.id,
      metadata: { entityRef: loc.entityRef },
    });
  }

  try {
    const analytics = await getFullGraphAnalytics(caseId);
    if (analytics.topByDegree?.length) {
      const top = analytics.topByDegree
        .slice(0, 5)
        .map((e) => `${e.label} ${e.value}: ${e.score} connections`)
        .join("; ");
      inputs.push({
        content: `Graph analytics — top connected entities: ${top}`,
        chunkType: "graph",
        sourceType: "graph_analytics",
        metadata: { topByDegree: analytics.topByDegree.slice(0, 5) },
      });
    }
    if (analytics.bridges?.length) {
      inputs.push({
        content: `Bridge nodes: ${analytics.bridges.slice(0, 5).map((b) => `${b.label} ${b.value} (betweenness ${b.betweenness})`).join("; ")}`,
        chunkType: "graph",
        sourceType: "graph_analytics",
        metadata: { bridges: analytics.bridges.slice(0, 5) },
      });
    }
    if (analytics.intelligence?.length) {
      inputs.push({
        content: `Intelligence scores: ${analytics.intelligence.slice(0, 5).map((i) => `${i.label} ${i.value}: score ${i.score} (${i.factors.join(", ")})`).join("; ")}`,
        chunkType: "graph",
        sourceType: "intelligence_score",
        metadata: { intelligence: analytics.intelligence.slice(0, 5) },
      });
    }
  } catch {
    // graph optional
  }

  try {
    const cdrAnalysis = await analyzeCdrForCase(caseId);
    if (cdrAnalysis.summary.totalRecords > 0) {
      inputs.push({
        content: `CDR intelligence: ${cdrAnalysis.summary.totalRecords} calls, ${cdrAnalysis.summary.uniquePhones} numbers. Bursts: ${cdrAnalysis.bursts.length}. Co-locations: ${cdrAnalysis.colocations.length}.`,
        chunkType: "cdr_intel",
        sourceType: "cdr_intelligence",
        metadata: { summary: cdrAnalysis.summary },
      });
    }
  } catch {
    // optional
  }

  try {
    const finAnalysis = await analyzeFinancialForCase(caseId);
    if (finAnalysis.summary.totalTransactions > 0) {
      inputs.push({
        content: `Financial intelligence: ${finAnalysis.summary.totalTransactions} transactions, volume ₹${finAnalysis.summary.totalVolume.toLocaleString("en-IN")}. Fan-out: ${finAnalysis.fanOut.length}. Circular flows: ${finAnalysis.circularFlows.length}. Smurfing: ${finAnalysis.smurfing.length}.`,
        chunkType: "financial_intel",
        sourceType: "financial_intelligence",
        metadata: { summary: finAnalysis.summary },
      });
    }
  } catch {
    // optional
  }

  const texts = inputs.map((i) => i.content);
  let embeddings: (number[] | null)[] = [];

  try {
    const res = await fetch(`${AI_SERVICE_URL}/embed-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
      signal: AbortSignal.timeout(120000),
    });
    if (res.ok) {
      const data = await res.json();
      embeddings = data.embeddings ?? [];
    }
  } catch {
    // batch optional
  }

  let created = 0;
  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i];
    let embedding = embeddings[i] ?? null;
    if (!embedding) {
      embedding = await embedText(inp.content);
    }

    await prisma.caseKnowledgeChunk.create({
      data: {
        caseId,
        content: inp.content,
        chunkType: inp.chunkType,
        sourceType: inp.sourceType,
        sourceId: inp.sourceId,
        evidenceId: inp.evidenceId,
        metadata: (inp.metadata ?? {}) as object,
        keywords: chunkKeywords(inp.content),
        embedding: embedding ?? undefined,
      },
    });
    created++;
  }

  return created;
}

async function buildStructuredContext(
  caseId: string,
  intent: CopilotIntent,
  query: string
): Promise<{ facts: Record<string, unknown>; sources: CopilotSource[] }> {
  const sources: CopilotSource[] = [];
  const facts: Record<string, unknown> = {};

  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      _count: { select: { entities: true, cdrRecords: true, transactions: true, evidence: true, alerts: true } },
    },
  });
  if (!caseData) return { facts, sources };

  facts.case = {
    caseNumber: caseData.caseNumber,
    crimeType: caseData.crimeType,
    status: caseData.status,
    priority: caseData.priority,
    location: caseData.location,
    description: caseData.description,
    counts: caseData._count,
  };
  sources.push({ type: "case", ref: caseId, confidence: 1.0, recordRef: caseData.caseNumber });

  if (intent === "SUMMARY" || intent === "GENERAL") {
    try {
      const analytics = await getFullGraphAnalytics(caseId);
      facts.graph = {
        topConnected: analytics.topByDegree?.slice(0, 5),
        bridges: analytics.bridges?.slice(0, 3),
        intelligence: analytics.intelligence?.slice(0, 5),
      };
      for (const e of analytics.topByDegree?.slice(0, 3) ?? []) {
        sources.push({ type: "graph_analytics", ref: e.id, confidence: 0.9, recordRef: e.value });
      }
    } catch {
      facts.graph = null;
    }
  }

  if (intent === "ENTITY_IMPORTANCE" || intent === "GENERAL") {
    const hint = extractEntityHint(query);
    try {
      const analytics = await getFullGraphAnalytics(caseId);
      facts.graph = facts.graph ?? {
        topConnected: analytics.topByDegree?.slice(0, 10),
        bridges: analytics.bridges?.slice(0, 5),
        intelligence: analytics.intelligence?.slice(0, 10),
      };

      if (hint) {
        const match = analytics.intelligence?.find(
          (i) => i.value.toLowerCase().includes(hint.toLowerCase())
        );
        const degree = analytics.topByDegree?.find(
          (d) => d.value.toLowerCase().includes(hint.toLowerCase())
        );
        const bridge = analytics.bridges?.find(
          (b) => b.value.toLowerCase().includes(hint.toLowerCase())
        );
        facts.entityFocus = { hint, match, degree, bridge };
        if (match) {
          sources.push({
            type: "intelligence_score",
            ref: match.id,
            confidence: Math.min(match.score / 100, 0.95),
            recordRef: match.value,
            excerpt: match.factors.join("; "),
          });
        }
      }

      for (const e of analytics.topByDegree?.slice(0, 5) ?? []) {
        sources.push({ type: "degree_centrality", ref: e.id, confidence: 0.88, recordRef: e.value });
      }
    } catch {
      // optional
    }
  }

  if (intent === "CROSS_CASE" || intent === "GENERAL") {
    const caseNumbers = extractCaseNumbers(query);
    const links = await findCrossCaseLinks();
    const relevant = links.filter((l) => {
      if (caseNumbers.length === 0) {
        return l.cases.some((c) => c.caseId === caseId);
      }
      return l.cases.some((c) => caseNumbers.includes(c.caseNumber.toUpperCase()));
    });
    facts.crossCaseLinks = relevant.slice(0, 10);
    for (const link of relevant.slice(0, 5)) {
      sources.push({
        type: "cross_case_link",
        ref: link.entityId,
        confidence: 0.85,
        recordRef: link.value,
        excerpt: `Appears in: ${link.cases.map((c) => c.caseNumber).join(", ")}`,
      });
    }
  }

  if (intent === "FINANCIAL" || intent === "GENERAL") {
    try {
      const fin = await analyzeFinancialForCase(caseId);
      facts.financial = {
        summary: fin.summary,
        fanOut: fin.fanOut.slice(0, 3),
        circularFlows: fin.circularFlows.slice(0, 3),
        smurfing: fin.smurfing.slice(0, 3),
        topSuspicious: fin.suspiciousScores.slice(0, 5),
      };
      for (const s of fin.suspiciousScores.slice(0, 3)) {
        sources.push({
          type: "financial_intelligence",
          ref: s.account,
          confidence: Math.min(s.score / 100, 0.92),
          recordRef: s.account,
          excerpt: s.factors.join("; "),
        });
      }
    } catch {
      facts.financial = null;
    }
  }

  if (intent === "COMMUNICATION" || intent === "GENERAL") {
    try {
      const cdr = await analyzeCdrForCase(caseId);
      facts.communication = {
        summary: cdr.summary,
        frequentContacts: cdr.frequentContacts.slice(0, 5),
        bursts: cdr.bursts.slice(0, 3),
        colocations: cdr.colocations.slice(0, 3),
      };
      for (const b of cdr.bursts.slice(0, 2)) {
        sources.push({
          type: "cdr_burst",
          ref: b.phone,
          confidence: 0.87,
          recordRef: b.phone,
          excerpt: b.reason,
        });
      }
    } catch {
      facts.communication = null;
    }
  }

  if (intent === "GEO_TIMELINE" || intent === "GENERAL") {
    try {
      const timeline = await getUnifiedTimeline(caseId);
      facts.timeline = {
        summary: timeline.summary,
        correlatedSequences: timeline.correlatedSequences.slice(0, 5),
        recentEvents: timeline.events.slice(-5),
      };
      for (const seq of timeline.correlatedSequences.slice(0, 2)) {
        sources.push({
          type: "correlated_sequence",
          ref: seq.pattern,
          confidence: seq.severity === "HIGH" ? 0.9 : 0.75,
          recordRef: seq.pattern,
          excerpt: seq.note,
        });
      }
    } catch {
      facts.timeline = null;
    }
  }

  if (intent === "ALERTS" || intent === "GENERAL") {
    const alerts = await prisma.alert.findMany({
      where: { caseId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    facts.alerts = alerts.map((a) => ({
      type: a.type,
      title: a.title,
      message: a.message,
      confidence: a.confidence,
    }));
    for (const a of alerts.slice(0, 5)) {
      sources.push({
        type: "alert",
        ref: a.id,
        confidence: a.confidence ?? 0.8,
        recordRef: a.type,
        excerpt: a.title,
      });
    }
  }

  if (intent === "EVIDENCE_SEARCH" || intent === "GENERAL") {
    const evidence = await prisma.evidence.findMany({
      where: { caseId },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
    facts.evidence = evidence.map((e) => ({
      id: e.id,
      fileName: e.fileName,
      type: e.type,
      status: e.ingestionStatus,
      hash: e.sha256Hash,
    }));
    for (const e of evidence.slice(0, 5)) {
      sources.push({
        type: "evidence",
        ref: e.id,
        evidenceId: e.id,
        confidence: 1.0,
        recordRef: e.fileName,
      });
    }
  }

  return { facts, sources };
}

function synthesizeFromFacts(
  query: string,
  intent: CopilotIntent,
  facts: Record<string, unknown>,
  chunks: RetrievedChunk[],
  sources: CopilotSource[]
): string {
  const caseInfo = facts.case as {
    caseNumber: string;
    crimeType: string;
    status: string;
    priority: string;
    counts: { entities: number; cdrRecords: number; transactions: number; alerts: number };
    description?: string;
  };

  const lines: string[] = [];
  const disclaimer =
    "\n\n— Investigative lead only. Review recommended. Not proof of criminality.";

  if (intent === "SUMMARY") {
    lines.push(`**Case Summary: ${caseInfo.caseNumber}**`);
    lines.push(`Type: ${caseInfo.crimeType} | Status: ${caseInfo.status} | Priority: ${caseInfo.priority}`);
    lines.push(
      `Data: ${caseInfo.counts.entities} entities, ${caseInfo.counts.cdrRecords} CDR records, ${caseInfo.counts.transactions} transactions, ${caseInfo.counts.alerts} alerts`
    );
    if (caseInfo.description) lines.push(`\n${caseInfo.description}`);

    const graph = facts.graph as { topConnected?: Array<{ label: string; value: string; score: number }> } | null;
    if (graph?.topConnected?.length) {
      lines.push("\n**Key connected entities:**");
      graph.topConnected.slice(0, 5).forEach((e, i) => {
        lines.push(`${i + 1}. ${e.label}: ${e.value} — ${e.score} connections`);
      });
    }
  } else if (intent === "CROSS_CASE") {
    const links = facts.crossCaseLinks as Array<{
      value: string;
      label: string;
      cases: Array<{ caseNumber: string }>;
    }>;
    if (!links?.length) {
      lines.push("No cross-case connections found in current graph data for this query.");
      lines.push("Upload more evidence or run a cross-case scan from the Intelligence page.");
    } else {
      lines.push(`**Cross-Case Connections (${links.length} found):**`);
      for (const link of links.slice(0, 8)) {
        const cases = link.cases.map((c) => c.caseNumber).join(", ");
        lines.push(`• ${link.label} **${link.value}** — linked across: ${cases}`);
      }
    }
  } else if (intent === "ENTITY_IMPORTANCE") {
    const focus = facts.entityFocus as {
      hint: string;
      match?: { value: string; score: number; factors: string[] };
      degree?: { value: string; score: number };
      bridge?: { value: string; betweenness: number; reason: string };
    } | undefined;

    const graph = facts.graph as {
      topConnected?: Array<{ label: string; value: string; score: number }>;
      intelligence?: Array<{ value: string; score: number; factors: string[] }>;
    };

    if (focus?.match || focus?.degree || focus?.bridge) {
      const target = focus.hint;
      lines.push(`**Importance analysis for "${target}":**`);
      if (focus.match) {
        lines.push(`• Intelligence score: **${focus.match.score}/100** — ${focus.match.factors.join(", ")}`);
      }
      if (focus.degree) {
        lines.push(`• Network connections: **${focus.degree.score}** direct links`);
      }
      if (focus.bridge) {
        lines.push(`• Bridge role: betweenness **${focus.bridge.betweenness}** — ${focus.bridge.reason}`);
      }
    } else if (graph?.topConnected?.length) {
      lines.push(`**Most connected entities in ${caseInfo.caseNumber}:**`);
      graph.topConnected.slice(0, 7).forEach((e, i) => {
        lines.push(`${i + 1}. ${e.label}: ${e.value} — ${e.score} connections`);
      });
      if (graph.intelligence?.length) {
        lines.push("\n**Intelligence scores:**");
        graph.intelligence.slice(0, 5).forEach((i) => {
          lines.push(`• ${i.value}: ${i.score}/100 (${i.factors.slice(0, 2).join(", ")})`);
        });
      }
    } else {
      lines.push("Insufficient graph data to rank entity importance. Upload CDR or transaction data first.");
    }
  } else if (intent === "FINANCIAL") {
    const fin = facts.financial as {
      summary: { totalTransactions: number; totalVolume: number };
      fanOut: Array<{ account: string; reason: string }>;
      circularFlows: Array<{ cycle: string[]; reason: string }>;
      smurfing: Array<{ account: string; reason: string }>;
    } | null;
    if (!fin?.summary?.totalTransactions) {
      lines.push("No financial transaction data ingested for this case yet.");
    } else {
      lines.push(`**Financial Intelligence — ${caseInfo.caseNumber}**`);
      lines.push(`${fin.summary.totalTransactions} transactions, total volume ₹${fin.summary.totalVolume.toLocaleString("en-IN")}`);
      if (fin.fanOut.length) {
        lines.push("\n**Fan-out patterns:**");
        fin.fanOut.forEach((f) => lines.push(`• ${f.account}: ${f.reason}`));
      }
      if (fin.circularFlows.length) {
        lines.push("\n**Circular flows:**");
        fin.circularFlows.forEach((c) => lines.push(`• ${c.cycle.join(" → ")}: ${c.reason}`));
      }
      if (fin.smurfing.length) {
        lines.push("\n**Smurfing/structuring:**");
        fin.smurfing.forEach((s) => lines.push(`• ${s.account}: ${s.reason}`));
      }
    }
  } else if (intent === "COMMUNICATION") {
    const comm = facts.communication as {
      summary: { totalRecords: number; uniquePhones: number };
      frequentContacts: Array<{ caller: string; receiver: string; callCount: number }>;
      bursts: Array<{ phone: string; reason: string }>;
    } | null;
    if (!comm?.summary?.totalRecords) {
      lines.push("No CDR data available. Upload call detail records to analyze communication patterns.");
    } else {
      lines.push(`**Communication Intelligence — ${comm.summary.totalRecords} calls, ${comm.summary.uniquePhones} numbers**`);
      if (comm.frequentContacts.length) {
        lines.push("\n**Frequent contacts:**");
        comm.frequentContacts.forEach((f) => lines.push(`• ${f.caller} ↔ ${f.receiver}: ${f.callCount} calls`));
      }
      if (comm.bursts.length) {
        lines.push("\n**Communication bursts:**");
        comm.bursts.forEach((b) => lines.push(`• ${b.phone}: ${b.reason}`));
      }
    }
  } else if (intent === "GEO_TIMELINE") {
    const tl = facts.timeline as {
      summary: { totalEvents: number; calls: number; transactions: number; locations: number };
      correlatedSequences: Array<{ pattern: string; note: string; severity: string }>;
    } | null;
    if (!tl?.summary?.totalEvents) {
      lines.push("No timeline events yet. Upload CDR, transactions, or tower logs.");
    } else {
      lines.push(`**Timeline: ${tl.summary.totalEvents} events** (${tl.summary.calls} calls, ${tl.summary.transactions} transfers, ${tl.summary.locations} locations)`);
      if (tl.correlatedSequences.length) {
        lines.push("\n**Correlated sequences:**");
        tl.correlatedSequences.forEach((s) => lines.push(`• [${s.severity}] ${s.pattern}: ${s.note}`));
      }
    }
  } else if (intent === "ALERTS") {
    const alerts = facts.alerts as Array<{ type: string; title: string; message: string; confidence: number }>;
    if (!alerts?.length) {
      lines.push("No active alerts for this case.");
    } else {
      lines.push(`**${alerts.length} alerts:**`);
      alerts.forEach((a) => lines.push(`• [${a.type}] ${a.title} (${Math.round((a.confidence ?? 0) * 100)}% confidence)`));
    }
  } else {
    lines.push(`**Analysis for "${query}" in ${caseInfo.caseNumber}:**`);
    lines.push(
      `${caseInfo.counts.entities} entities, ${caseInfo.counts.cdrRecords} CDR records, ${caseInfo.counts.transactions} transactions tracked.`
    );
    if (chunks.length > 0) {
      lines.push("\n**Relevant evidence excerpts:**");
      chunks.slice(0, 4).forEach((c) => lines.push(`• ${c.content.slice(0, 200)}`));
    }
  }

  if (chunks.length > 0 && intent !== "GENERAL") {
    const extra = chunks.filter((c) => !lines.some((l) => l.includes(c.content.slice(0, 40))));
    if (extra.length > 0) {
      lines.push("\n**Supporting context from knowledge index:**");
      extra.slice(0, 3).forEach((c) => lines.push(`• ${c.content.slice(0, 180)}`));
    }
  }

  const uniqueSources = sources.length;
  if (uniqueSources > 0) {
    lines.push(`\n*Based on ${uniqueSources} verified source reference(s).*`);
  }

  return lines.join("\n") + disclaimer;
}

async function synthesizeWithLlm(
  query: string,
  intent: CopilotIntent,
  draftAnswer: string,
  facts: Record<string, unknown>,
  chunks: RetrievedChunk[]
): Promise<string | null> {
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
            content: `You are Bharat Raksha AI for Indian law enforcement (SIH26190 — MHA legal & investigation document management, Smart Automation).
RULES:
- ONLY use facts from the provided context. Never invent entities, amounts, or connections.
- Cite evidence by referring to source types (CDR, transaction, graph analytics, alert).
- Use language: "review recommended", "investigative lead", "confidence level".
- NEVER declare anyone guilty or a criminal.
- If data is insufficient, say so clearly.
- Keep answers structured with bullet points.`,
          },
          {
            role: "user",
            content: `Intent: ${intent}
Query: ${query}
Structured facts (ground truth): ${JSON.stringify(facts).slice(0, 6000)}
Retrieved chunks: ${chunks.map((c) => c.content).join("\n---\n").slice(0, 4000)}
Draft answer (must preserve all facts): ${draftAnswer}`,
          },
        ],
        max_tokens: 800,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? null;
    }
  } catch {
    // use draft
  }
  return null;
}

function dedupeSources(sources: CopilotSource[]): CopilotSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = `${s.type}:${s.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function chunksToSources(chunks: RetrievedChunk[]): CopilotSource[] {
  return chunks.map((c) => ({
    type: c.sourceType,
    ref: c.sourceId ?? c.id,
    evidenceId: c.evidenceId ?? undefined,
    recordRef: c.content.slice(0, 80),
    confidence: Math.min(0.5 + c.score * 2, 0.95),
    excerpt: c.content.slice(0, 200),
  }));
}

export async function queryCopilot(
  caseId: string,
  query: string,
  userId: string
): Promise<CopilotResponse> {
  let chunkCount = await prisma.caseKnowledgeChunk.count({ where: { caseId } });
  if (chunkCount === 0) {
    await indexCaseKnowledge(caseId);
    chunkCount = await prisma.caseKnowledgeChunk.count({ where: { caseId } });
  }

  const intent = classifyIntent(query);
  const [{ facts, sources: structSources }, chunks] = await Promise.all([
    buildStructuredContext(caseId, intent, query),
    hybridRetrieve(caseId, query, 8),
  ]);

  const chunkSources = chunksToSources(chunks);
  const allSources = dedupeSources([...structSources, ...chunkSources]);

  let answer = synthesizeFromFacts(query, intent, facts, chunks, allSources);
  const llmAnswer = await synthesizeWithLlm(query, intent, answer, facts, chunks);
  if (llmAnswer) answer = llmAnswer;

  await prisma.copilotQueryLog.create({
    data: {
      caseId,
      userId,
      query,
      intent,
      answer,
      sources: allSources as object,
    },
  });

  return {
    answer,
    intent,
    sources: allSources,
    chunks,
    structuredFacts: facts,
    computedAt: new Date().toISOString(),
  };
}
