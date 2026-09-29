/**
 * Step 13 verification — AI Investigation Copilot (RAG)
 * Run: APP_URL=http://localhost:3001 npx tsx scripts/verify-step13-copilot.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@bharat-raksha/database";
import { ensureEvidenceProcessed } from "./lib/ingest-helper";
import {
  classifyIntent,
  tokenize,
  bm25Score,
  indexCaseKnowledge,
  hybridRetrieve,
  queryCopilot,
} from "../apps/web/src/lib/copilot-rag";

const BASE = process.env.APP_URL ?? "http://localhost:3001";
const TESTDATA = join(__dirname, "../testdata");

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name: string, detail?: string) {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const cookies = csrfRes.headers.getSetCookie?.() ?? [];
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies.map((c) => c.split(";")[0]).join("; "),
    },
    body: new URLSearchParams({
      csrfToken,
      email: "investigator@bharatraksha.gov.in",
      password: "Invest@Bharat2026!",
      redirect: "false",
      json: "true",
    }),
    redirect: "manual",
  });
  return [...cookies, ...(loginRes.headers.getSetCookie?.() ?? [])]
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function upload(
  cookie: string,
  caseId: string,
  filePath: string,
  fileName: string,
  type: string
) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(filePath)]), fileName);
  form.append("type", type);
  const res = await fetch(`${BASE}/api/cases/${caseId}/ingest`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  const { job, evidence } = await res.json();
  await ensureEvidenceProcessed(evidence.id, job.id, 30000);
}

async function main() {
  console.log(`\n=== Step 13 Copilot RAG Verification ===`);
  console.log(`App: ${BASE}\n`);

  // Unit tests
  if (classifyIntent("Summarize this case") === "SUMMARY") pass("classifyIntent SUMMARY");
  else fail("classifyIntent SUMMARY");

  if (classifyIntent("Who are the most connected entities?") === "ENTITY_IMPORTANCE") {
    pass("classifyIntent ENTITY_IMPORTANCE");
  } else fail("classifyIntent ENTITY_IMPORTANCE");

  if (classifyIntent("Show connections between cases") === "CROSS_CASE") pass("classifyIntent CROSS_CASE");
  else fail("classifyIntent CROSS_CASE");

  if (classifyIntent("Explain financial anomalies") === "FINANCIAL") pass("classifyIntent FINANCIAL");
  else fail("classifyIntent FINANCIAL");

  const tokens = tokenize("Who connects case A to case B?");
  if (tokens.includes("connects") && tokens.includes("case")) pass("tokenize()");
  else fail("tokenize()");

  const docFreq = new Map([["fraud", 1], ["money", 2]]);
  const score = bm25Score(["fraud", "money"], tokenize("fraud money transfer"), 5, docFreq, 10);
  if (score > 0) pass("bm25Score()", score.toFixed(2));
  else fail("bm25Score()");

  const cookie = await login();
  const headers = { Cookie: cookie, "Content-Type": "application/json" };

  const createRes = await fetch(`${BASE}/api/cases`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      crimeType: "Cyber Fraud",
      location: "Bengaluru",
      priority: "HIGH",
      description: "Step 13 Copilot RAG verification case",
    }),
  });
  if (!createRes.ok) {
    fail("Create case", await createRes.text());
    process.exit(1);
  }
  const testCase = await createRes.json();
  pass("Create case", testCase.caseNumber);

  try {
    await upload(cookie, testCase.id, join(TESTDATA, "sample_fir.txt"), "sample_fir.txt", "FIR");
    pass("Upload FIR");
  } catch (e) {
    fail("Upload FIR", String(e));
  }

  try {
    await upload(cookie, testCase.id, join(TESTDATA, "sample_cdr.csv"), "sample_cdr.csv", "CDR");
    pass("Upload CDR");
  } catch (e) {
    fail("Upload CDR", String(e));
  }

  try {
    await upload(cookie, testCase.id, join(TESTDATA, "sample_transactions_aml.csv"), "sample_txn.csv", "BANK_TXN");
    pass("Upload transactions");
  } catch (e) {
    fail("Upload transactions", String(e));
  }

  const chunksIndexed = await indexCaseKnowledge(testCase.id);
  if (chunksIndexed > 0) pass("indexCaseKnowledge()", `${chunksIndexed} chunks`);
  else fail("indexCaseKnowledge()");

  const chunkCount = await prisma.caseKnowledgeChunk.count({ where: { caseId: testCase.id } });
  if (chunkCount >= chunksIndexed) pass("Knowledge chunks in DB", `${chunkCount} chunks`);
  else fail("Knowledge chunks in DB");

  const retrieved = await hybridRetrieve(testCase.id, "financial transaction fraud", 5);
  if (retrieved.length > 0) pass("hybridRetrieve()", `${retrieved.length} chunks`);
  else fail("hybridRetrieve()");

  const investigator = await prisma.user.findUnique({
    where: { email: "investigator@bharatraksha.gov.in" },
  });
  if (!investigator) {
    fail("Investigator user for queryCopilot");
    process.exit(1);
  }

  const summaryResult = await queryCopilot(testCase.id, "Summarize this case", investigator.id);
  if (summaryResult.answer.length > 50) pass("queryCopilot SUMMARY", `${summaryResult.answer.length} chars`);
  else fail("queryCopilot SUMMARY");

  if (summaryResult.sources.length > 0) pass("Sources in SUMMARY response", `${summaryResult.sources.length} sources`);
  else fail("Sources in SUMMARY response");

  if (summaryResult.intent === "SUMMARY") pass("Intent in response");
  else fail("Intent in response", summaryResult.intent);

  const entityResult = await queryCopilot(
    testCase.id,
    "Who are the most connected entities?",
    investigator.id
  );
  if (entityResult.answer.length > 30) pass("queryCopilot ENTITY_IMPORTANCE");
  else fail("queryCopilot ENTITY_IMPORTANCE");

  const crossResult = await queryCopilot(
    testCase.id,
    "Show connections between cases",
    investigator.id
  );
  if (crossResult.answer.length > 20) pass("queryCopilot CROSS_CASE");
  else fail("queryCopilot CROSS_CASE");

  const logCount = await prisma.copilotQueryLog.count({ where: { caseId: testCase.id } });
  if (logCount >= 3) pass("Copilot query logs", `${logCount} queries logged`);
  else fail("Copilot query logs", `${logCount}`);

  // API tests
  const indexGet = await fetch(`${BASE}/api/cases/${testCase.id}/copilot/index`, {
    headers: { Cookie: cookie },
  });
  if (indexGet.ok) {
    const idx = await indexGet.json();
    if (idx.chunkCount > 0) pass("GET /copilot/index", `${idx.chunkCount} chunks`);
    else fail("GET /copilot/index");
  } else fail("GET /copilot/index");

  const copilotRes = await fetch(`${BASE}/api/copilot/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: "Explain financial anomalies", caseId: testCase.id }),
  });
  if (copilotRes.ok) {
    const data = await copilotRes.json();
    if (data.answer && data.sources?.length > 0) {
      pass("POST /api/copilot/query", `intent=${data.intent}, ${data.sources.length} sources`);
    } else fail("POST /api/copilot/query");
  } else fail("POST /api/copilot/query", await copilotRes.text());

  const reindexRes = await fetch(`${BASE}/api/cases/${testCase.id}/copilot/index`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  if (reindexRes.ok) {
    const data = await reindexRes.json();
    pass("POST /copilot/index reindex", `${data.chunksIndexed} chunks`);
  } else fail("POST /copilot/index");

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n=== ${passed}/${total} checks passed ===\n`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
