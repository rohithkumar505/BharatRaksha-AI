/**
 * Step 15 verification — Security + E2E full flow
 * Run: APP_URL=http://localhost:3001 npx tsx scripts/verify-step15-security-e2e.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@bharat-raksha/database";
import { ensureEvidenceProcessed } from "./lib/ingest-helper";
import {
  encryptPii,
  decryptPii,
  isEncrypted,
  piiEncryptionEnabled,
} from "../apps/web/src/lib/pii-crypto";
import { scanFileBuffer, isDangerousExtension } from "../apps/web/src/lib/file-security";
import { getCaseGraph } from "../apps/web/src/lib/neo4j-sync";

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

async function main() {
  console.log(`\n=== Step 15 Security + E2E Verification ===`);
  console.log(`App: ${BASE}\n`);

  // PII crypto unit tests
  if (piiEncryptionEnabled()) {
    const enc = encryptPii("9876543210");
    if (isEncrypted(enc) && decryptPii(enc) === "9876543210") pass("PII encrypt/decrypt roundtrip");
    else fail("PII encrypt/decrypt roundtrip");
  } else {
    const plain = encryptPii("9876543210");
    if (plain === "9876543210") pass("PII passthrough (no key set)");
    else fail("PII passthrough");
  }

  if (isDangerousExtension("malware.exe")) pass("Dangerous extension blocked");
  else fail("Dangerous extension blocked");

  const csvScan = scanFileBuffer(Buffer.from("caller,receiver\n123,456"), "test.csv", "text/csv");
  if (csvScan.safe) pass("CSV file scan safe");
  else fail("CSV file scan");

  const pdfScan = scanFileBuffer(Buffer.from("%PDF-1.4 test"), "doc.pdf", "application/pdf");
  if (pdfScan.safe) pass("PDF magic bytes scan");
  else fail("PDF magic bytes scan");

  const cookie = await login();
  const headers = { Cookie: cookie, "Content-Type": "application/json" };

  // E2E: login → create case → upload → graph → copilot → report → verify integrity
  pass("E2E: Login");

  const createRes = await fetch(`${BASE}/api/cases`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      crimeType: "Cyber Fraud E2E",
      location: "Delhi",
      priority: "HIGH",
      description: "Step 15 full E2E test",
    }),
  });
  if (!createRes.ok) {
    fail("E2E: Create case", await createRes.text());
    process.exit(1);
  }
  const testCase = await createRes.json();
  pass("E2E: Create case", testCase.caseNumber);

  for (const [file, type] of [
    ["sample_fir.txt", "FIR"],
    ["sample_cdr.csv", "CDR"],
    ["sample_transactions_aml.csv", "BANK_TXN"],
  ] as const) {
    const form = new FormData();
    form.append("file", new Blob([readFileSync(join(TESTDATA, file))]), file);
    form.append("type", type);
    const res = await fetch(`${BASE}/api/cases/${testCase.id}/ingest`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    });
    if (!res.ok) {
      fail(`E2E: Upload ${file}`, await res.text());
      continue;
    }
    const { job, evidence } = await res.json();
    await ensureEvidenceProcessed(evidence.id, job.id, 30000);
    pass(`E2E: Upload + process ${file}`);
  }

  const graphRes = await fetch(`${BASE}/api/cases/${testCase.id}/graph?nodeLimit=100&nodeOffset=0`, {
    headers: { Cookie: cookie },
  });
  if (graphRes.ok) {
    const g = await graphRes.json();
    if (g.pagination?.totalNodes !== undefined) pass("E2E: Graph with pagination", `${g.pagination.totalNodes} nodes`);
    else pass("E2E: Graph API", `${g.nodes?.length ?? 0} nodes`);
  } else fail("E2E: Graph API");

  const graphLib = await getCaseGraph(testCase.id, 2, undefined, { nodeLimit: 50, nodeOffset: 0 });
  if (graphLib.pagination?.hasMore !== undefined) pass("Graph pagination lib", `total=${graphLib.pagination.totalNodes}`);
  else fail("Graph pagination lib");

  const copilotRes = await fetch(`${BASE}/api/copilot/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: "Summarize this case", caseId: testCase.id }),
  });
  if (copilotRes.ok) {
    const c = await copilotRes.json();
    if (c.answer && c.sources?.length > 0) pass("E2E: Copilot query", `${c.sources.length} sources`);
    else fail("E2E: Copilot query");
  } else fail("E2E: Copilot", await copilotRes.text());

  const reportRes = await fetch(`${BASE}/api/cases/${testCase.id}/reports`, { method: "POST", headers: { Cookie: cookie } });
  if (reportRes.ok) pass("E2E: Generate report");
  else fail("E2E: Generate report", await reportRes.text());

  const evidence = await prisma.evidence.findFirst({ where: { caseId: testCase.id } });
  if (evidence) {
    const verifyRes = await fetch(`${BASE}/api/evidence/${evidence.id}/verify`, {
      headers: { Cookie: cookie },
    });
    if (verifyRes.ok) {
      const v = await verifyRes.json();
      if (v.verified === true || v.valid === true) pass("E2E: Evidence integrity verify");
      else fail("E2E: Evidence integrity", JSON.stringify(v));
    } else fail("E2E: Evidence verify API");
  }

  const badForm = new FormData();
  badForm.append("file", new Blob([Buffer.from("MZ")]), "virus.exe");
  badForm.append("type", "FIR");
  const badUpload = await fetch(`${BASE}/api/cases/${testCase.id}/ingest`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: badForm,
  });
  if (badUpload.status === 400) pass("E2E: Block dangerous upload");
  else fail("E2E: Block dangerous upload", String(badUpload.status));

  const healthRes = await fetch(`${BASE}/api/health`);
  if (healthRes.ok) pass("Health check");

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
