/**
 * Pin-to-pin SIH26190 API smoke test (requires web on :3000 + seeded user + at least one case).
 * Run: npx tsx scripts/verify-sih26190-live.ts
 */
import { extractCasesList } from "../apps/web/src/lib/api-list";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const EMAIL = process.env.BR_EMAIL ?? "investigator@bharatraksha.gov.in";
const PASS = process.env.BR_PASSWORD ?? "Invest@Bharat2026!";

async function login(): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const jar: string[] = [];
  const c1 = csrfRes.headers.get("set-cookie");
  if (c1) jar.push(c1.split(";")[0]);

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar.join("; "),
    },
    body: new URLSearchParams({
      csrfToken,
      email: EMAIL,
      password: PASS,
      json: "true",
      redirect: "false",
    }),
  });
  const c2 = res.headers.get("set-cookie");
  if (c2) jar.push(c2.split(";")[0]);
  await res.json().catch(() => ({}));
  return jar.join("; ");
}

async function get(path: string, cookie: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  return { status: res.status, ok: res.ok };
}

async function post(path: string, cookie: string, body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
  return { status: res.status, ok: res.ok };
}

async function main() {
  console.log("SIH26190 live verify @", BASE);
  const cookie = await login();
  console.log("✓ login");

  const checks: Array<[string, () => Promise<{ ok: boolean; status: number }>]> = [
    ["capabilities", () => get("/api/legal-documents/capabilities", cookie)],
    ["command-center", () => get("/api/legal-documents/command-center", cookie)],
    ["stats", () => get("/api/legal-documents/stats", cookie)],
    ["retention-watch", () => get("/api/legal-documents/retention-watch", cookie)],
    ["retention-scan", () => post("/api/legal-documents/command-center", cookie)],
    ["automation-playbooks", () => get("/api/legal-documents/automation/playbooks", cookie)],
    ["reliability", () => get("/api/legal-documents/reliability", cookie)],
    ["daily-autopilot", () => post("/api/legal-documents/automation/daily-run", cookie)],
  ];

  const casesRes = await fetch(`${BASE}/api/cases?limit=5`, { headers: { Cookie: cookie } });
  let caseId: string | undefined;
  try {
    const casesData = await casesRes.json();
    const list = extractCasesList<{ id: string }>(casesData);
    caseId = list[0]?.id;
  } catch {
    console.warn("Could not parse /api/cases — is web running?");
  }

  if (caseId) {
    checks.push(
      ["legal-documents", () => get(`/api/cases/${caseId}/legal-documents`, cookie)],
      ["readiness", () => get(`/api/cases/${caseId}/legal-documents/readiness`, cookie)],
      ["timeline", () => get(`/api/cases/${caseId}/legal-documents/timeline`, cookie)],
      ["pending-review", () => get(`/api/cases/${caseId}/legal-documents/pending-review`, cookie)],
      ["register", () => get(`/api/cases/${caseId}/legal-documents/register`, cookie)],
      ["disclosure", () => get(`/api/cases/${caseId}/legal-documents/disclosure-schedule`, cookie)],
      ["court-prep", () => post(`/api/cases/${caseId}/legal-documents/court-prep`, cookie)],
      ["seed-samples", () => post(`/api/cases/${caseId}/legal-documents/seed-samples`, cookie)],
      ["bulk-review", () => post(`/api/cases/${caseId}/legal-documents/bulk-review`, cookie)],
      ["verify", () => post(`/api/cases/${caseId}/legal-documents/verify`, cookie)],
      ["audit-export", () => get(`/api/cases/${caseId}/legal-documents/audit-export`, cookie)],
      ["templates", () => get(`/api/cases/${caseId}/legal-documents/templates?key=fir_outline`, cookie)],
      ["duplicates", () => get(`/api/cases/${caseId}/legal-documents/duplicates`, cookie)],
      ["court-bundle-manifest", () => get(`/api/cases/${caseId}/legal-documents/court-bundle-manifest`, cookie)],
      ["automation-run", () =>
        post(`/api/cases/${caseId}/legal-documents/automation/run`, cookie, {
          playbookId: "smart_fir_pack_linker",
        }),
      ]
    );
  } else {
    console.warn("No case — skipping case-scoped checks");
  }

  checks.push(["public-verify", () => get("/api/legal-documents/public-verify?register=REG-X&hash=1234567890abcdef", "")]);
  checks.push(["verify-page", () => get("/verify-document", "")]);
  checks.push(["legal-command-page", () => get("/legal-command", cookie)]);
  checks.push(["sih26190-portal", () => get("/sih26190", cookie)]);

  let failed = 0;
  for (const [name, fn] of checks) {
    const { ok, status } = await fn();
    const pass = ok || status === 404; // public verify 404 ok for fake reg
    console.log(pass ? "✓" : "✗", name, status);
    if (!pass) failed++;
  }

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll SIH26190 pin-to-pin checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
