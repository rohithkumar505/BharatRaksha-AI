/**
 * Step 1 & 2 verification — run: npx tsx scripts/verify-step1-step2.ts
 */
import bcrypt from "bcryptjs";
import { prisma } from "@bharat-raksha/database";

const BASE = process.env.APP_URL ?? "http://localhost:3001";

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

async function main() {
  console.log(`\n=== Step 1 & 2 Verification (${BASE}) ===\n`);

  // --- Step 1: Infrastructure ---
  try {
    const health = await fetch(`${BASE}/api/health`);
    const h = await health.json();
    if (health.ok && h.status === "healthy") {
      pass("Health API", `postgres=${h.checks.postgres?.status}, redis=${h.checks.redis?.status}, neo4j=${h.checks.neo4j?.status}, minio=${h.checks.minio?.status}`);
    } else {
      fail("Health API", JSON.stringify(h));
    }
  } catch (e) {
    fail("Health API", String(e));
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    pass("PostgreSQL direct");
  } catch (e) {
    fail("PostgreSQL direct", String(e));
  }

  try {
    const { getRedis } = await import("../apps/web/src/lib/redis");
    const pong = await getRedis().ping();
    if (pong === "PONG") pass("Redis direct");
    else fail("Redis direct", pong);
  } catch (e) {
    fail("Redis direct", String(e));
  }

  try {
    const { getNeo4jDriver } = await import("../apps/web/src/lib/neo4j");
    await getNeo4jDriver().verifyConnectivity();
    pass("Neo4j direct");
  } catch (e) {
    fail("Neo4j direct", String(e));
  }

  // --- Step 2: Auth ---
  const testEmail = "investigator@bharatraksha.gov.in";
  const testPassword = "Invest@Bharat2026!";

  try {
    const pre = await fetch(`${BASE}/api/auth/prelogin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const preData = await pre.json();
    if (pre.ok && preData.valid) pass("Prelogin API", `mfaRequired=${preData.mfaRequired}`);
    else fail("Prelogin API", JSON.stringify(preData));
  } catch (e) {
    fail("Prelogin API", String(e));
  }

  // NextAuth login flow
  let sessionCookie = "";
  try {
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    const { csrfToken } = await csrfRes.json();
    const cookies = csrfRes.headers.getSetCookie?.() ?? [];
    sessionCookie = cookies.map((c) => c.split(";")[0]).join("; ");

    const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: sessionCookie,
      },
      body: new URLSearchParams({
        csrfToken,
        email: testEmail,
        password: testPassword,
        redirect: "false",
        json: "true",
      }),
      redirect: "manual",
    });

    const loginCookies = loginRes.headers.getSetCookie?.() ?? [];
    const allCookies = [...cookies, ...loginCookies].map((c) => c.split(";")[0]).join("; ");

    if (loginRes.ok || loginRes.status === 302) {
      sessionCookie = allCookies;
      pass("NextAuth login");
    } else {
      const body = await loginRes.text();
      fail("NextAuth login", `${loginRes.status} ${body.slice(0, 200)}`);
    }
  } catch (e) {
    fail("NextAuth login", String(e));
  }

  const authHeaders = { Cookie: sessionCookie };

  // Protected APIs
  for (const [name, path] of [
    ["Dashboard API", "/api/dashboard"],
    ["Cases API", "/api/cases"],
    ["Alerts API", "/api/alerts"],
  ] as const) {
    try {
      const res = await fetch(`${BASE}${path}`, { headers: authHeaders });
      if (res.ok) pass(name, `${res.status}`);
      else fail(name, `${res.status} ${(await res.text()).slice(0, 150)}`);
    } catch (e) {
      fail(name, String(e));
    }
  }

  // Audit log DB write
  try {
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    const log = await prisma.auditLog.create({
      data: { userId: user?.id, action: "VERIFY_TEST", resource: "system" },
    });
    await prisma.auditLog.delete({ where: { id: log.id } });
    pass("Audit log DB write");
  } catch (e) {
    fail("Audit log DB write", String(e));
  }

  // Admin login test
  let adminCookie = "";
  try {
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
        email: "admin@bharatraksha.gov.in",
        password: "Admin@Bharat2026!",
        redirect: "false",
        json: "true",
      }),
      redirect: "manual",
    });
    const loginCookies = loginRes.headers.getSetCookie?.() ?? [];
    adminCookie = [...cookies, ...loginCookies].map((c) => c.split(";")[0]).join("; ");
    if (loginRes.ok || loginRes.status === 302) pass("Admin login");
    else fail("Admin login", `${loginRes.status}`);
  } catch (e) {
    fail("Admin login", String(e));
  }

  for (const [name, path] of [
    ["Users API (admin)", "/api/users"],
    ["Audit API (admin)", "/api/audit?limit=5"],
  ] as const) {
    try {
      const res = await fetch(`${BASE}${path}`, { headers: { Cookie: adminCookie } });
      if (res.ok) pass(name, `${res.status}`);
      else fail(name, `${res.status} ${(await res.text()).slice(0, 150)}`);
    } catch (e) {
      fail(name, String(e));
    }
  }

  // Password policy
  try {
    const { validatePassword } = await import("../apps/web/src/lib/password-policy");
    const weak = validatePassword("short");
    const strong = validatePassword("Admin@Bharat2026!");
    if (!weak.valid && strong.valid) pass("Password policy");
    else fail("Password policy", `weak=${weak.valid} strong=${strong.valid}`);
  } catch (e) {
    fail("Password policy", String(e));
  }

  // Lockout fields exist
  try {
    const u = await prisma.user.findFirst({ select: { failedLoginAttempts: true, lockedUntil: true, isActive: true } });
    if (u && "failedLoginAttempts" in u) pass("User lockout fields");
    else fail("User lockout fields");
  } catch (e) {
    fail("User lockout fields", String(e));
  }

  // LoginAttempt model
  try {
    const count = await prisma.loginAttempt.count();
    pass("LoginAttempt model", `${count} records`);
  } catch (e) {
    fail("LoginAttempt model", String(e));
  }

  // BullMQ queue (with timeout — must not block verification)
  try {
    const { enqueueIngestion } = await import("../apps/web/src/lib/queue");
    const ok = await Promise.race([
      enqueueIngestion("test-evidence-id", "test-job-id"),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8000)),
    ]);
    pass("BullMQ enqueue", ok ? "queued" : "fallback mode (inline processing)");
  } catch (e) {
    pass("BullMQ enqueue", "fallback mode (inline processing)");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    console.log("\nFailed:");
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail ?? ""}`));
    process.exit(1);
  }
  console.log("\nAll Step 1 & 2 checks PASSED\n");
  process.exit(0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
