/**
 * Live API smoke — critical routes with real auth + real case data
 * APP_URL=http://localhost:3001 npx tsx scripts/smoke-live-apis.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@bharat-raksha/database";
import { ensureEvidenceProcessed } from "./lib/ingest-helper";

const BASE = process.env.APP_URL ?? "http://localhost:3001";
const TESTDATA = join(__dirname, "../testdata");

type R = { name: string; ok: boolean; detail?: string };
const results: R[] = [];
function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name: string, detail?: string) {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login() {
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

async function upload(cookie: string, caseId: string, file: string, type: string) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(join(TESTDATA, file))]), file);
  form.append("type", type);
  const res = await fetch(`${BASE}/api/cases/${caseId}/ingest`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  if (!res.ok) throw new Error(`${file}: ${await res.text()}`);
  const { job, evidence } = await res.json();
  await ensureEvidenceProcessed(evidence.id, job.id, 45000);
  return evidence.id as string;
}

async function main() {
  console.log(`\n=== Live API Smoke (${BASE}) ===\n`);

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  if (health.status === "healthy") pass("Health", Object.keys(health.checks).join(","));
  else fail("Health", JSON.stringify(health));

  const ai = await fetch("http://localhost:8001/health").then((r) => r.json()).catch(() => null);
  if (ai?.status === "ok") pass("AI service", ai.version);
  else fail("AI service");

  const cookie = await login();
  const H = { Cookie: cookie, "Content-Type": "application/json" };

  const create = await fetch(`${BASE}/api/cases`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      crimeType: "Live Smoke Test",
      location: "Bengaluru",
      priority: "HIGH",
      description: "End-to-end live backend connectivity check",
    }),
  });
  if (!create.ok) {
    fail("Create case", await create.text());
    process.exit(1);
  }
  const c = await create.json();
  pass("Create case", c.caseNumber);

  let evidenceId = "";
  try {
    evidenceId = await upload(cookie, c.id, "sample_fir.txt", "FIR");
    await upload(cookie, c.id, "sample_cdr.csv", "CDR");
    await upload(cookie, c.id, "sample_transactions_aml.csv", "BANK_TXN");
    await upload(cookie, c.id, "sample_tower.csv", "TOWER");
    pass("Upload+process 4 evidence types");
  } catch (e) {
    fail("Upload evidence", String(e));
  }

  const routes: Array<[string, string]> = [
    ["GET", `/api/cases/${c.id}`],
    ["GET", `/api/cases/${c.id}/graph?nodeLimit=100`],
    ["GET", `/api/cases/${c.id}/graph/analytics`],
    ["GET", `/api/cases/${c.id}/communication`],
    ["GET", `/api/cases/${c.id}/financial`],
    ["GET", `/api/cases/${c.id}/map-data`],
    ["GET", `/api/cases/${c.id}/timeline`],
    ["GET", `/api/cases/${c.id}/entities`],
    ["GET", `/api/cases/${c.id}/snapshots`],
    ["GET", `/api/dashboard`],
    ["GET", `/api/alerts`],
  ];

  for (const [method, path] of routes) {
    const res = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookie } });
    if (res.ok) pass(`${method} ${path.split("?")[0].replace(`/api/cases/${c.id}`, "/cases/:id")}`);
    else fail(`${method} ${path}`, `${res.status} ${await res.text()}`);
  }

  const copilot = await fetch(`${BASE}/api/copilot/query`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ query: "Who are the most connected entities?", caseId: c.id }),
  });
  if (copilot.ok) {
    const d = await copilot.json();
    if (d.answer && d.sources?.length) pass("Copilot grounded answer", `${d.sources.length} sources, intent=${d.intent}`);
    else fail("Copilot grounded answer", JSON.stringify(d).slice(0, 200));
  } else fail("Copilot", await copilot.text());

  const report = await fetch(`${BASE}/api/cases/${c.id}/reports`, { method: "POST", headers: { Cookie: cookie } });
  if (report.ok) {
    const d = await report.json();
    const dl = await fetch(`${BASE}/api/cases/${c.id}/reports/${d.report.id}/download`, {
      headers: { Cookie: cookie },
    });
    if (dl.ok && dl.headers.get("content-type")?.includes("pdf")) pass("Report PDF download");
    else fail("Report PDF download", String(dl.status));
  } else fail("Report generate", await report.text());

  if (evidenceId) {
    const v = await fetch(`${BASE}/api/evidence/${evidenceId}/verify`, { headers: { Cookie: cookie } });
    if (v.ok) {
      const d = await v.json();
      if (d.verified) pass("Evidence integrity live");
      else fail("Evidence integrity", JSON.stringify(d).slice(0, 150));
    } else fail("Evidence verify", await v.text());
  }

  // Ensure no mock: counts must come from ingested data
  const detail = await fetch(`${BASE}/api/cases/${c.id}`, { headers: { Cookie: cookie } }).then((r) => r.json());
  if (
    detail._count?.entities > 0 &&
    detail._count?.cdrRecords > 0 &&
    detail._count?.transactions > 0 &&
    detail._count?.alerts > 0
  ) {
    pass(
      "Real DB counts (no mock)",
      `entities=${detail._count.entities} cdr=${detail._count.cdrRecords} txn=${detail._count.transactions} alerts=${detail._count.alerts}`
    );
  } else {
    fail("Real DB counts", JSON.stringify(detail._count));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== Smoke: ${results.length - failed.length}/${results.length} passed ===\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
