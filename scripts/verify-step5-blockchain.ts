/**
 * Step 5 verification — Blockchain Chain of Custody
 * Run: APP_URL=http://localhost:3001 npx tsx scripts/verify-step5-blockchain.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@bharat-raksha/database";
import {
  verifyGlobalLedgerChain,
  verifyEvidenceLedgerChain,
  computeBlockHash,
  GENESIS_HASH,
} from "../apps/web/src/lib/evidence-ledger";
import { verifyEvidenceIntegrity } from "../apps/web/src/lib/blockchain";

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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies.map((c) => c.split(";")[0]).join("; "),
    },
    body: new URLSearchParams({ csrfToken, email, password, redirect: "false", json: "true" }),
    redirect: "manual",
  });
  return [...cookies, ...(loginRes.headers.getSetCookie?.() ?? [])]
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function main() {
  console.log(`\n=== Step 5 Blockchain Verification (${BASE}) ===\n`);

  // Unit: hash chain computation
  const testHash = computeBlockHash({
    blockIndex: 0,
    previousHash: GENESIS_HASH,
    event: "UPLOADED",
    userId: "test-user",
    payload: { sha256Hash: "abc123" },
  });
  if (testHash.length === 64) pass("Block hash computation (SHA-256 hex)");
  else fail("Block hash computation");

  const globalBefore = await verifyGlobalLedgerChain();
  pass("Global ledger verify (pre-test)", globalBefore.message);

  const cookie = await login("investigator@bharatraksha.gov.in", "Invest@Bharat2026!");
  const headers = { Cookie: cookie };

  // Create case for evidence upload
  const createRes = await fetch(`${BASE}/api/cases`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      crimeType: "Chain of Custody Test",
      location: "Delhi",
      priority: "HIGH",
      description: "Step 5 blockchain verification case",
    }),
  });

  if (!createRes.ok) {
    fail("Create test case", await createRes.text());
    process.exit(1);
  }

  const testCase = await createRes.json();
  pass("Create test case", testCase.caseNumber);

  // Upload evidence
  const sampleCsv = readFileSync(join(TESTDATA, "sample_cdr.csv"));
  const form = new FormData();
  form.append("file", new Blob([sampleCsv], { type: "text/csv" }), "sample_cdr.csv");
  form.append("type", "CDR");

  const uploadRes = await fetch(`${BASE}/api/cases/${testCase.id}/ingest`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });

  if (!uploadRes.ok) {
    fail("Upload evidence", await uploadRes.text());
    process.exit(1);
  }

  const uploadData = await uploadRes.json();
  const evidenceId = uploadData.evidence.id;
  pass("Upload evidence with SHA-256", uploadData.evidence.sha256Hash?.slice(0, 16) + "...");

  // Check blockchain anchor on evidence
  const ev = await prisma.evidence.findUnique({ where: { id: evidenceId } });
  if (ev?.blockchainTxId && ev.blockchainTxId.length === 64) {
    pass("Evidence anchored to ledger", `blockHash=${ev.blockchainTxId.slice(0, 16)}...`);
  } else {
    fail("Evidence anchored to ledger", ev?.blockchainTxId ?? "missing");
  }

  // Ledger block created
  const ledgerBlock = await prisma.ledgerBlock.findFirst({
    where: { evidenceId, event: "UPLOADED" },
  });
  if (ledgerBlock) {
    pass("UPLOADED ledger block", `index=#${ledgerBlock.blockIndex}`);
  } else {
    fail("UPLOADED ledger block");
  }

  // Custody chain API
  const custodyRes = await fetch(`${BASE}/api/evidence/${evidenceId}/custody`, { headers });
  if (custodyRes.ok) {
    const custody = await custodyRes.json();
    if ((custody.events ?? []).length >= 1) pass("Custody chain API", `${custody.events.length} events`);
    else fail("Custody chain API", "no events");
  } else {
    fail("Custody chain API", await custodyRes.text());
  }

  // Verify integrity API
  const verifyRes = await fetch(`${BASE}/api/evidence/${evidenceId}/verify`, { headers });
  if (verifyRes.ok) {
    const verify = await verifyRes.json();
    if (verify.verified) pass("INTEGRITY VERIFIED", verify.message);
    else fail("INTEGRITY VERIFIED", verify.message);
  } else {
    fail("Verify API", await verifyRes.text());
  }

  // Programmatic integrity check
  const integrity = await verifyEvidenceIntegrity(evidenceId);
  if (integrity.verified && integrity.fileVerified && integrity.chainVerified) {
    pass("File + chain integrity", `events=${integrity.custodyEventCount}`);
  } else {
    fail("File + chain integrity", JSON.stringify(integrity));
  }

  // Export logs EXPORTED event
  const exportRes = await fetch(`${BASE}/api/evidence/${evidenceId}/download?format=custody-bundle`, { headers });
  if (exportRes.ok) pass("Custody bundle export");
  else fail("Custody bundle export", await exportRes.text());

  // Transfer custody
  const senior = await prisma.user.findUnique({
    where: { email: "senior@bharatraksha.gov.in" },
  });
  if (senior) {
    const transferRes = await fetch(`${BASE}/api/evidence/${evidenceId}/transfer`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: senior.id, reason: "Step 5 verification custody handoff" }),
    });
    if (transferRes.ok) pass("Custody TRANSFERRED event");
    else fail("Custody TRANSFERRED", await transferRes.text());
  }

  // Global ledger API
  const ledgerRes = await fetch(`${BASE}/api/ledger`, { headers });
  if (ledgerRes.ok) {
    const ledger = await ledgerRes.json();
    if (ledger.verification?.valid) pass("Global ledger API verified", `${ledger.blocks?.length ?? 0} blocks`);
    else fail("Global ledger API", ledger.verification?.message);
  } else {
    fail("Global ledger API", await ledgerRes.text());
  }

  const chainResult = await verifyEvidenceLedgerChain(evidenceId);
  if (chainResult.valid) pass("Evidence ledger chain", chainResult.message);
  else fail("Evidence ledger chain", chainResult.message);

  const globalResult = await verifyGlobalLedgerChain();
  if (globalResult.valid) pass("Global ledger chain", globalResult.message);
  else fail("Global ledger chain", globalResult.message);

  // Custody events count (UPLOADED + VERIFIED + EXPORTED + TRANSFERRED)
  const eventCount = await prisma.custodyLog.count({ where: { evidenceId } });
  if (eventCount >= 3) pass("All custody events recorded", `${eventCount} events`);
  else fail("All custody events recorded", `only ${eventCount}`);

  console.log(`\n=== Results: ${results.filter((r) => r.ok).length}/${results.length} passed ===\n`);

  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
