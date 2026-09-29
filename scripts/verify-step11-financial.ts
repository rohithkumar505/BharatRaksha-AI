/**
 * Step 11 verification — Financial Intelligence (AML)
 * Run: APP_URL=http://localhost:3001 npx tsx scripts/verify-step11-financial.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@bharat-raksha/database";
import { ensureEvidenceProcessed } from "./lib/ingest-helper";
import {
  analyzeFinancialForCase,
  detectFanOut,
  detectFanIn,
  detectCircularFlows,
  detectRapidMovement,
  detectSmurfing,
  computeSuspiciousScores,
  buildFinancialSubgraph,
  createFinancialAlerts,
  filterByAmount,
  HIGH_VALUE_THRESHOLD_INR,
} from "../apps/web/src/lib/financial-intelligence";

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

async function uploadTxn(cookie: string, caseId: string, filePath: string, fileName: string) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(filePath)]), fileName);
  form.append("type", "BANK_TXN");
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
  console.log(`\n=== Step 11 Financial Intelligence Verification ===`);
  console.log(`App: ${BASE}\n`);

  const cookie = await login();
  const headers = { Cookie: cookie, "Content-Type": "application/json" };

  const createRes = await fetch(`${BASE}/api/cases`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      crimeType: "Money Laundering",
      location: "Mumbai",
      priority: "CRITICAL",
      description: "Step 11 financial verification",
    }),
  });
  if (!createRes.ok) {
    fail("Create case", await createRes.text());
    process.exit(1);
  }
  const testCase = await createRes.json();
  pass("Create case", testCase.caseNumber);

  try {
    await uploadTxn(cookie, testCase.id, join(TESTDATA, "sample_transactions.csv"), "sample_transactions.csv");
    pass("Upload sample transactions");
  } catch (e) {
    fail("Upload sample transactions", String(e));
  }

  try {
    await uploadTxn(cookie, testCase.id, join(TESTDATA, "sample_transactions_aml.csv"), "sample_transactions_aml.csv");
    pass("Upload AML pattern transactions");
  } catch (e) {
    fail("Upload AML transactions", String(e));
  }

  const records = await prisma.transaction.findMany({ where: { caseId: testCase.id } });
  if (records.length > 0) pass("Transactions in DB", `${records.length} records`);
  else fail("Transactions in DB");

  const txns = records.map((t) => ({
    id: t.id,
    sender: t.sender,
    receiver: t.receiver,
    amount: Number(t.amount),
    timestamp: t.timestamp,
    bank: t.bank,
    upiId: t.upiId,
    evidenceId: t.evidenceId,
  }));

  const transferred = await prisma.relationship.count({
    where: { sourceEntity: { caseId: testCase.id }, relationType: "TRANSFERRED" },
  });
  if (transferred > 0) pass("TRANSFERRED edges in DB", `${transferred}`);
  else fail("TRANSFERRED edges");

  const fanOut = detectFanOut(txns);
  if (fanOut.length > 0) pass("Fan-out detection", `${fanOut[0].account}: ${fanOut[0].uniqueCounterparties} recipients`);
  else fail("Fan-out detection");

  const fanIn = detectFanIn(txns);
  if (fanIn.length > 0) pass("Fan-in detection", `${fanIn[0].account}: ${fanIn[0].uniqueCounterparties} senders`);
  else fail("Fan-in detection");

  const circular = detectCircularFlows(txns);
  if (circular.length > 0) pass("Circular flow detection", `${circular[0].cycle.join("→")}`);
  else fail("Circular flow detection");

  const rapid = detectRapidMovement(txns);
  if (rapid.length > 0) pass("Rapid movement detection", `${rapid[0].hops} hops in ${rapid[0].timeSpanMinutes}min`);
  else fail("Rapid movement detection");

  const smurfing = detectSmurfing(txns);
  if (smurfing.length > 0) pass("Smurfing detection", `${smurfing[0].account}: ${smurfing[0].subThresholdCount} sub-threshold`);
  else fail("Smurfing detection");

  const scores = computeSuspiciousScores(txns, fanOut, fanIn, circular, rapid, smurfing);
  if (scores.length > 0 && scores[0].factors.length > 0) {
    pass("Suspicious scores", `top: ${scores[0].account} score=${scores[0].score}`);
  } else fail("Suspicious scores");

  const subgraph = buildFinancialSubgraph(txns);
  if (subgraph.nodes.length > 0 && subgraph.edges.length > 0) {
    pass("Financial flow subgraph", `${subgraph.nodes.length} nodes, ${subgraph.edges.length} edges`);
  } else fail("Financial flow subgraph");

  const highValue = filterByAmount(txns, HIGH_VALUE_THRESHOLD_INR);
  if (highValue.length > 0) pass("Amount filter (≥₹1L)", `${highValue.length} transactions`);
  else fail("Amount filter");

  const analysis = await analyzeFinancialForCase(testCase.id);
  if (analysis.summary.totalTransactions > 0) pass("Full financial analysis bundle");
  else fail("Full analysis bundle");

  const finRes = await fetch(`${BASE}/api/cases/${testCase.id}/financial`, { headers: { Cookie: cookie } });
  if (finRes.ok) {
    const fin = await finRes.json();
    if (fin.circularFlows && fin.suspiciousScores && fin.subgraph) pass("Financial API GET");
    else fail("Financial API GET", "missing fields");
  } else fail("Financial API GET");

  const filterRes = await fetch(`${BASE}/api/cases/${testCase.id}/financial?minAmount=100000`, {
    headers: { Cookie: cookie },
  });
  if (filterRes.ok) {
    const filtered = await filterRes.json();
    if (filtered.filteredTransactions?.length >= 0) pass("Financial API amount filter");
    else fail("Financial API amount filter");
  } else fail("Financial API amount filter");

  const subgraphRes = await fetch(`${BASE}/api/cases/${testCase.id}/financial?subgraph=true`, {
    headers: { Cookie: cookie },
  });
  if (subgraphRes.ok) {
    const sg = await subgraphRes.json();
    if (sg.subgraph?.nodes?.length > 0) pass("Financial subgraph API");
    else fail("Financial subgraph API");
  } else fail("Financial subgraph API");

  const alertsCreated = await createFinancialAlerts(testCase.id);
  pass("Create financial alerts", `${alertsCreated} new alerts`);

  const anomalyAlerts = await prisma.alert.count({
    where: { caseId: testCase.id, type: "TRANSACTION_ANOMALY" },
  });
  if (anomalyAlerts > 0) pass("TRANSACTION_ANOMALY alerts", `${anomalyAlerts}`);
  else fail("TRANSACTION_ANOMALY alerts");

  const postRes = await fetch(`${BASE}/api/cases/${testCase.id}/financial`, { method: "POST", headers });
  if (postRes.ok) pass("Financial API POST (re-analyze)");
  else fail("Financial API POST");

  await prisma.case.delete({ where: { id: testCase.id } }).catch(() => {});

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n=== Results: ${passed}/${total} passed ===\n`);
  process.exit(passed < total ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
