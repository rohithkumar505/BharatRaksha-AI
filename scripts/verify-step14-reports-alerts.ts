/**
 * Step 14 verification — Reports + Alerts + What-Changed
 * Run: APP_URL=http://localhost:3001 npx tsx scripts/verify-step14-reports-alerts.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@bharat-raksha/database";
import { ensureEvidenceProcessed } from "./lib/ingest-helper";
import { generateInvestigationReport } from "../apps/web/src/lib/report-generator";
import { renderReportPdf } from "../apps/web/src/lib/pdf-report";
import { createBridgeAlerts, runPostIngestionAlerts } from "../apps/web/src/lib/alert-engine";
import { captureCaseSnapshot, diffSnapshots } from "../apps/web/src/lib/snapshots";

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

async function upload(cookie: string, caseId: string, filePath: string, fileName: string, type: string) {
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
  console.log(`\n=== Step 14 Reports + Alerts Verification ===`);
  console.log(`App: ${BASE}\n`);

  const cookie = await login();
  const headers = { Cookie: cookie, "Content-Type": "application/json" };

  const createRes = await fetch(`${BASE}/api/cases`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      crimeType: "Organized Crime",
      location: "Mumbai",
      priority: "HIGH",
      description: "Step 14 verification case",
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
    await upload(cookie, testCase.id, join(TESTDATA, "sample_cdr.csv"), "sample_cdr.csv", "CDR");
    await upload(cookie, testCase.id, join(TESTDATA, "sample_transactions_aml.csv"), "sample_txn.csv", "BANK_TXN");
    pass("Upload evidence bundle");
  } catch (e) {
    fail("Upload evidence", String(e));
  }

  const investigator = await prisma.user.findUnique({
    where: { email: "investigator@bharatraksha.gov.in" },
  });

  const report = await generateInvestigationReport(testCase.id, investigator!.id);
  const sectionIds = report.sections.map((s) => s.id);
  const required = ["summary", "network", "timeline", "financial", "relationships", "leads", "sources"];
  if (required.every((id) => sectionIds.includes(id))) {
    pass("Report sections", sectionIds.join(", "));
  } else fail("Report sections", sectionIds.join(", "));

  const pdf = await renderReportPdf(report);
  if (pdf.length > 1000 && pdf.slice(0, 4).toString() === "%PDF") pass("PDF generation", `${pdf.length} bytes`);
  else fail("PDF generation");

  const alertsRun = await runPostIngestionAlerts(testCase.id);
  pass("runPostIngestionAlerts", JSON.stringify(alertsRun));

  const bridgeCount = await createBridgeAlerts(testCase.id);
  if (bridgeCount >= 0) pass("createBridgeAlerts", `${bridgeCount} created`);

  const alertCount = await prisma.alert.count({ where: { caseId: testCase.id } });
  if (alertCount > 0) pass("Alerts in DB", `${alertCount} alerts`);
  else fail("Alerts in DB");

  const snap1 = await captureCaseSnapshot(testCase.id);
  const snap2 = { ...snap1, entityCount: snap1.entityCount + 5 };
  const diff = diffSnapshots(snap1, snap2);
  if (diff.some((d) => d.field === "entityCount" && d.delta === 5)) pass("Snapshot diff");
  else fail("Snapshot diff");

  const snapRes = await fetch(`${BASE}/api/cases/${testCase.id}/snapshots`, { headers: { Cookie: cookie } });
  if (snapRes.ok) pass("GET /snapshots API");
  else fail("GET /snapshots API");

  const reportPost = await fetch(`${BASE}/api/cases/${testCase.id}/reports`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  if (reportPost.ok) {
    const data = await reportPost.json();
    pass("POST /reports generate", `${data.sectionCount} sections`);

    const dl = await fetch(`${BASE}/api/cases/${testCase.id}/reports/${data.report.id}/download`, {
      headers: { Cookie: cookie },
    });
    if (dl.ok && dl.headers.get("content-type")?.includes("pdf")) {
      pass("GET /reports/download PDF");
    } else fail("GET /reports/download PDF");
  } else fail("POST /reports", await reportPost.text());

  const reportsList = await fetch(`${BASE}/api/cases/${testCase.id}/reports`, { headers: { Cookie: cookie } });
  if (reportsList.ok) {
    const list = await reportsList.json();
    if (list.reports?.length > 0) pass("GET /reports list", `${list.reports.length} reports`);
    else fail("GET /reports list");
  } else fail("GET /reports list");

  const caseDetail = await fetch(`${BASE}/api/cases/${testCase.id}`, { headers: { Cookie: cookie } });
  if (caseDetail.ok) {
    const c = await caseDetail.json();
    if (Array.isArray(c.changesSinceLastVisit)) pass("What-changed on case GET");
    else fail("What-changed on case GET");
  } else fail("Case GET with snapshot");

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
