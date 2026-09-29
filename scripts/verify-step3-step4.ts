/**
 * Step 3 & 4 verification — run: APP_URL=http://localhost:3001 npx tsx scripts/verify-step3-step4.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@bharat-raksha/database";
import { ensureEvidenceProcessed } from "./lib/ingest-helper";

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

async function login(email: string, password: string): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const cookies = csrfRes.headers.getSetCookie?.() ?? [];
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookies.map((c) => c.split(";")[0]).join("; ") },
    body: new URLSearchParams({ csrfToken, email, password, redirect: "false", json: "true" }),
    redirect: "manual",
  });
  return [...cookies, ...(loginRes.headers.getSetCookie?.() ?? [])].map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  console.log(`\n=== Step 3 & 4 Verification (${BASE}) ===\n`);

  const cookie = await login("investigator@bharatraksha.gov.in", "Invest@Bharat2026!");
  const headers = { Cookie: cookie, "Content-Type": "application/json" };

  // Step 3: Case CRUD
  const createRes = await fetch(`${BASE}/api/cases`, {
    method: "POST",
    headers,
    body: JSON.stringify({ crimeType: "Cyber Fraud Test", location: "Bengaluru", priority: "HIGH", description: "Step 3 test case" }),
  });
  if (createRes.ok) {
    const c = await createRes.json();
    pass("Case CREATE", c.caseNumber);

    const listRes = await fetch(`${BASE}/api/cases?status=OPEN&search=Cyber`, { headers });
    const listData = await listRes.json();
    if (listRes.ok && (listData.cases ?? listData).length > 0) pass("Case LIST with filters");
    else fail("Case LIST with filters");

    const noteRes = await fetch(`${BASE}/api/cases/${c.id}/notes`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content: "Test investigator note — case diary entry" }),
    });
    if (noteRes.ok) pass("Investigator notes POST");
    else fail("Investigator notes POST");

    const notesGet = await fetch(`${BASE}/api/cases/${c.id}/notes`, { headers });
    if (notesGet.ok) pass("Investigator notes GET");
    else fail("Investigator notes GET");

    const patchRes = await fetch(`${BASE}/api/cases/${c.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "UNDER_INVESTIGATION", priority: "CRITICAL" }),
    });
    if (patchRes.ok) pass("Case PATCH (status/priority)");
    else fail("Case PATCH", await patchRes.text());

    const officersRes = await fetch(`${BASE}/api/cases/officers`, { headers });
    if (officersRes.ok) pass("Assignable officers API", `${(await officersRes.json()).length} officers`);
    else fail("Assignable officers API");

    const dashRes = await fetch(`${BASE}/api/dashboard`, { headers });
    if (dashRes.ok) {
      const dash = await dashRes.json();
      pass("Dashboard live stats", `activeCases=${dash.stats.activeCases}`);
    } else fail("Dashboard");

    const snapRes = await fetch(`${BASE}/api/cases/${c.id}/snapshots`, { headers });
    if (snapRes.ok) pass("Investigation snapshots API");
    else fail("Investigation snapshots API");

    // Step 4: Ingest all 7 types
    const files: Array<{ path: string; type: string; name: string }> = [
      { path: "sample_fir.txt", type: "FIR", name: "FIR" },
      { path: "sample_cdr.csv", type: "CDR", name: "CDR" },
      { path: "sample_transactions.csv", type: "BANK_TXN", name: "BANK_TXN" },
      { path: "sample_vehicle.csv", type: "VEHICLE", name: "VEHICLE" },
      { path: "sample_email.csv", type: "EMAIL", name: "EMAIL" },
      { path: "sample_tower.csv", type: "TOWER", name: "TOWER" },
      { path: "sample_surveillance.txt", type: "SURVEILLANCE", name: "SURVEILLANCE" },
    ];

    for (const f of files) {
      const buffer = readFileSync(join(TESTDATA, f.path));
      const form = new FormData();
      form.append("file", new Blob([buffer]), f.path);
      form.append("type", f.type);
      const ingestRes = await fetch(`${BASE}/api/cases/${c.id}/ingest`, { method: "POST", headers: { Cookie: cookie }, body: form });
      if (!ingestRes.ok) {
        fail(`Ingest ${f.name}`, await ingestRes.text());
        continue;
      }
      const { job, evidence } = await ingestRes.json();
      await ensureEvidenceProcessed(evidence.id, job.id);
      pass(`Ingest ${f.name}`, `job ${job.id}`);
    }

    const jobsRes = await fetch(`${BASE}/api/cases/${c.id}/ingest`, { headers });
    if (jobsRes.ok) {
      const jobs = await jobsRes.json();
      pass("Ingestion job list API", `${jobs.length} jobs`);
      const completed = jobs.filter((j: { status: string }) => j.status === "COMPLETED").length;
      if (completed >= 7) pass("All 7 source types processed");
      else fail("All 7 source types processed", `${completed}/7 completed`);
    } else fail("Ingestion job list API");

    const finalCase = await fetch(`${BASE}/api/cases/${c.id}`, { headers });
    const caseData = await finalCase.json();
    if (caseData._count.cdrRecords > 0) pass("CDR records in DB", `${caseData._count.cdrRecords} records`);
    else fail("CDR records in DB");
    if (caseData._count.transactions > 0) pass("Transactions in DB", `${caseData._count.transactions} records`);
    else fail("Transactions in DB");
    if (caseData._count.entities > 0) pass("Entities fused", `${caseData._count.entities} entities`);
    else fail("Entities fused");

    // Cleanup test case
    const adminCookie = await login("admin@bharatraksha.gov.in", "Admin@Bharat2026!");
    await fetch(`${BASE}/api/cases/${c.id}`, { method: "DELETE", headers: { Cookie: adminCookie } });
  } else {
    fail("Case CREATE", await createRes.text());
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail ?? ""}`));
    process.exit(1);
  }
  console.log("\nAll Step 3 & 4 checks PASSED\n");
  process.exit(0);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
