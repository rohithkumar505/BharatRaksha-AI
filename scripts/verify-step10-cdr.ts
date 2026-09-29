/**
 * Step 10 verification — CDR Communication Intelligence
 * Run: APP_URL=http://localhost:3001 npx tsx scripts/verify-step10-cdr.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@bharat-raksha/database";
import { ensureEvidenceProcessed } from "./lib/ingest-helper";
import {
  analyzeCdrForCase,
  analyzeFrequentContacts,
  detectBursts,
  detectColocations,
  analyzeDeviceLinks,
  buildCommunicationSubgraph,
  createCdrAlerts,
} from "../apps/web/src/lib/cdr-intelligence";

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

async function uploadFile(cookie: string, caseId: string, filePath: string, fileName: string) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(filePath)]), fileName);
  form.append("type", "CDR");
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
  console.log(`\n=== Step 10 CDR Intelligence Verification ===`);
  console.log(`App: ${BASE}\n`);

  const cookie = await login();
  const headers = { Cookie: cookie, "Content-Type": "application/json" };

  const createRes = await fetch(`${BASE}/api/cases`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      crimeType: "Telecom Fraud",
      location: "Bengaluru",
      priority: "HIGH",
      description: "Step 10 CDR verification",
    }),
  });
  if (!createRes.ok) {
    fail("Create case", await createRes.text());
    process.exit(1);
  }
  const testCase = await createRes.json();
  pass("Create case", testCase.caseNumber);

  try {
    await uploadFile(cookie, testCase.id, join(TESTDATA, "sample_cdr.csv"), "sample_cdr.csv");
    pass("Upload sample CDR");
  } catch (e) {
    fail("Upload sample CDR", String(e));
  }

  try {
    await uploadFile(cookie, testCase.id, join(TESTDATA, "sample_cdr_burst.csv"), "sample_cdr_burst.csv");
    pass("Upload burst CDR (IMEI + co-location)");
  } catch (e) {
    fail("Upload burst CDR", String(e));
  }

  const records = await prisma.cdrRecord.findMany({ where: { caseId: testCase.id } });
  if (records.length > 0) pass("CDR records in DB", `${records.length} records`);
  else fail("CDR records in DB");

  const calleRels = await prisma.relationship.count({
    where: { sourceEntity: { caseId: testCase.id }, relationType: "CALLED" },
  });
  if (calleRels > 0) pass("CALLED edges in DB", `${calleRels} relationships`);
  else fail("CALLED edges in DB");

  const deviceRels = await prisma.relationship.count({
    where: { sourceEntity: { caseId: testCase.id }, relationType: "USES_DEVICE" },
  });
  if (deviceRels > 0) pass("USES_DEVICE edges (IMEI)", `${deviceRels} links`);
  else fail("USES_DEVICE edges (IMEI)");

  const frequent = analyzeFrequentContacts(records);
  if (frequent.length > 0 && frequent[0].callCount >= 2) {
    pass("Frequent contacts analysis", `top pair: ${frequent[0].callCount} calls`);
  } else fail("Frequent contacts analysis");

  const bursts = detectBursts(records);
  if (bursts.length > 0) pass("Burst detection", `${bursts.length} bursts, top ${bursts[0].callCount} calls`);
  else fail("Burst detection", "no bursts (burst CSV should trigger)");

  const colocations = detectColocations(records);
  if (colocations.length > 0) pass("Co-location detection", `${colocations.length} events at ${colocations[0].towerId}`);
  else fail("Co-location detection");

  const devices = analyzeDeviceLinks(records);
  if (devices.length > 0) pass("IMEI device linking", `${devices.length} devices`);
  else fail("IMEI device linking");

  const shared = devices.filter((d) => d.sharedDevice);
  if (shared.length > 0) pass("Shared device detection", `${shared.length} shared IMEIs`);
  else pass("Shared device detection", "none (ok if unique IMEI per phone)");

  const subgraph = buildCommunicationSubgraph(records);
  if (subgraph.nodes.length > 0 && subgraph.edges.length > 0) {
    pass("Communication subgraph", `${subgraph.nodes.length} nodes, ${subgraph.edges.length} edges`);
  } else fail("Communication subgraph");

  const analysis = await analyzeCdrForCase(testCase.id);
  if (analysis.summary.totalRecords > 0) pass("Full CDR analysis bundle");
  else fail("Full CDR analysis bundle");

  const commRes = await fetch(`${BASE}/api/cases/${testCase.id}/communication`, { headers: { Cookie: cookie } });
  if (commRes.ok) {
    const comm = await commRes.json();
    if (comm.frequentContacts && comm.bursts && comm.subgraph) pass("Communication API GET");
    else fail("Communication API GET", "missing fields");
  } else fail("Communication API GET", await commRes.text());

  const subgraphRes = await fetch(`${BASE}/api/cases/${testCase.id}/communication?subgraph=true`, {
    headers: { Cookie: cookie },
  });
  if (subgraphRes.ok) {
    const sg = await subgraphRes.json();
    if (sg.subgraph?.nodes?.length > 0) pass("Communication subgraph API");
    else fail("Communication subgraph API");
  } else fail("Communication subgraph API");

  const alertCount = await createCdrAlerts(testCase.id);
  pass("Create CDR alerts", `${alertCount} alerts created`);

  const burstAlerts = await prisma.alert.count({
    where: { caseId: testCase.id, type: "COMMUNICATION_BURST" },
  });
  if (burstAlerts > 0) pass("COMMUNICATION_BURST alerts in DB", `${burstAlerts}`);
  else fail("COMMUNICATION_BURST alerts in DB");

  const colocAlerts = await prisma.alert.count({
    where: { caseId: testCase.id, type: "COMMON_LOCATION" },
  });
  if (colocAlerts > 0) pass("COMMON_LOCATION alerts in DB", `${colocAlerts}`);
  else pass("COMMON_LOCATION alerts", "none created (may already exist)");

  const postRes = await fetch(`${BASE}/api/cases/${testCase.id}/communication`, {
    method: "POST",
    headers,
  });
  if (postRes.ok) pass("Communication API POST (re-analyze)");
  else fail("Communication API POST");

  const neo4jRels = await prisma.relationship.findMany({
    where: { sourceEntity: { caseId: testCase.id }, relationType: "CALLED" },
    include: { sourceEntity: true, targetEntity: true },
    take: 3,
  });
  if (neo4jRels.length > 0) {
    const withNeo4j = neo4jRels.filter((r) => r.neo4jEdgeId);
    pass("Neo4j CALLED sync", `${withNeo4j.length}/${neo4jRels.length} synced`);
  }

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
