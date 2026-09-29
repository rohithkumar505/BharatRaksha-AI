/**
 * Step 6 & 7 verification — OCR/NER/Normalization + Entity Resolution
 * Run: APP_URL=http://localhost:3001 AI_SERVICE_URL=http://localhost:8001 npx tsx scripts/verify-step6-step7.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@bharat-raksha/database";
import { localExtractEntities } from "../apps/web/src/lib/ai-client";
import { normalizeEntityValue, nameSimilarity, addressSimilarity } from "../apps/web/src/lib/normalize";
import { ensureEvidenceProcessed } from "./lib/ingest-helper";

const BASE = process.env.APP_URL ?? "http://localhost:3001";
const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8001";
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
  console.log(`\n=== Step 6 & 7 Verification ===`);
  console.log(`App: ${BASE} | AI: ${AI_URL}\n`);

  // --- Step 6: AI Service ---
  const healthRes = await fetch(`${AI_URL}/health`);
  if (healthRes.ok) {
    const h = await healthRes.json();
    pass("AI service health", `v${h.version}, ${h.entity_types} entity types`);
  } else {
    fail("AI service health", "Start: cd services/ai && python -m uvicorn main:app --port 8001");
  }

  const firText = readFileSync(join(TESTDATA, "sample_fir.txt"), "utf-8");

  const nerRes = await fetch(`${AI_URL}/extract-entities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: firText }),
  });
  if (nerRes.ok) {
    const ner = await nerRes.json();
    const types = new Set((ner.entities ?? []).map((e: { type: string }) => e.type));
    if (types.size >= 8) pass("NER extract-entities", `${ner.entities.length} entities, ${types.size} types`);
    else fail("NER extract-entities", `only ${types.size} types`);
    if (types.has("PHONE") && types.has("PERSON") && types.has("AMOUNT")) pass("NER key types (PHONE/PERSON/AMOUNT)");
    else fail("NER key types");
  } else {
    fail("NER extract-entities", await nerRes.text());
  }

  const normRes = await fetch(`${AI_URL}/normalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "PHONE", value: "9876543210" }),
  });
  if (normRes.ok) {
    const n = await normRes.json();
    if (n.normalized === "+919876543210") pass("/normalize phone", n.normalized);
    else fail("/normalize phone", n.normalized);
  } else {
    fail("/normalize endpoint");
  }

  const hinglishNorm = await fetch(`${AI_URL}/normalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "AMOUNT", value: "50 hazaar" }),
  });
  if (hinglishNorm.ok) {
    const h = await hinglishNorm.json();
    if (h.normalized.includes("50,000")) pass("Hinglish amount normalization", h.normalized);
    else fail("Hinglish amount", h.normalized);
  }

  const localEntities = localExtractEntities(firText);
  if (localEntities.length >= 10) pass("Local NER fallback", `${localEntities.length} entities`);
  else fail("Local NER fallback", `${localEntities.length}`);

  if (normalizeEntityValue("PHONE", "09876543210") === "+919876543210") pass("TS normalizePhone");
  else fail("TS normalizePhone");

  if (nameSimilarity("Rahul Sharma", "Rahul Kumar") >= 0.4) pass("Name similarity");
  else fail("Name similarity");

  if (addressSimilarity("Koramangala Bengaluru", "Bengaluru Koramangala") >= 0.5) pass("Address fuzzy match");
  else fail("Address fuzzy match");

  // --- Step 6: Upload FIR → entities in DB ---
  const cookie = await login("investigator@bharatraksha.gov.in", "Invest@Bharat2026!");
  const headers = { Cookie: cookie, "Content-Type": "application/json" };

  const createRes = await fetch(`${BASE}/api/cases`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      crimeType: "Step 6/7 AI Test",
      location: "Bengaluru",
      priority: "HIGH",
      description: "Entity resolution verification case",
    }),
  });
  if (!createRes.ok) {
    fail("Create test case", await createRes.text());
    process.exit(1);
  }
  const testCase = await createRes.json();
  pass("Create test case", testCase.caseNumber);

  const form = new FormData();
  form.append("file", new Blob([firText], { type: "text/plain" }), "sample_fir.txt");
  form.append("type", "FIR");

  const uploadRes = await fetch(`${BASE}/api/cases/${testCase.id}/ingest`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  if (!uploadRes.ok) {
    fail("Upload FIR", await uploadRes.text());
    process.exit(1);
  }
  const uploadData = await uploadRes.json();
  pass("Upload FIR for NER", uploadData.evidence?.id);

  try {
    await ensureEvidenceProcessed(uploadData.evidence.id, uploadData.job.id);
    pass("FIR ingestion completed");
  } catch (err) {
    fail("FIR ingestion", err instanceof Error ? err.message : String(err));
  }

  const entityCount = await prisma.entity.count({ where: { caseId: testCase.id, mergedIntoId: null } });
  if (entityCount >= 8) pass("Entities in DB", `${entityCount} entities`);
  else fail("Entities in DB", `only ${entityCount}`);

  const entitiesApi = await fetch(`${BASE}/api/cases/${testCase.id}/entities`, { headers: { Cookie: cookie } });
  if (entitiesApi.ok) {
    const ed = await entitiesApi.json();
    if ((ed.entities ?? []).length >= 8) pass("Entities API", `${ed.total} total`);
    else fail("Entities API");
  } else {
    fail("Entities API");
  }

  // --- Step 7: Create duplicate entities and test match + merge ---
  const rahul1 = await prisma.entity.create({
    data: {
      caseId: testCase.id,
      type: "PERSON",
      normalizedValue: "Rahul Sharma",
      rawValues: ["Rahul Sharma", "Mr Rahul Sharma"],
      confidence: 0.85,
    },
  });
  const rahul2 = await prisma.entity.create({
    data: {
      caseId: testCase.id,
      type: "PERSON",
      normalizedValue: "Rahul Kumar Sharma",
      rawValues: ["Rahul Kumar Sharma"],
      confidence: 0.8,
    },
  });

  const sim = nameSimilarity(rahul1.normalizedValue, rahul2.normalizedValue);
  if (sim >= 0.7) pass("Duplicate name detection score", `${Math.round(sim * 100)}%`);

  const [idA, idB] = rahul1.id < rahul2.id ? [rahul1.id, rahul2.id] : [rahul2.id, rahul1.id];
  const match = await prisma.entityMatch.create({
    data: {
      entityAId: idA,
      entityBId: idB,
      confidence: Math.round(sim * 100),
      reasons: [`Name similarity: ${Math.round(sim * 100)}%`],
    },
  });
  pass("EntityMatch created", match.id);

  const matchesApi = await fetch(`${BASE}/api/entities/matches?status=PENDING&caseId=${testCase.id}`, {
    headers: { Cookie: cookie },
  });
  if (matchesApi.ok) {
    const md = await matchesApi.json();
    if (md.some((m: { id: string }) => m.id === match.id)) pass("Matches API with case filter");
    else fail("Matches API case filter");
  } else {
    fail("Matches API");
  }

  const approveRes = await fetch(`${BASE}/api/entities/matches`, {
    method: "POST",
    headers,
    body: JSON.stringify({ matchId: match.id, action: "approve" }),
  });
  if (approveRes.ok) pass("Approve merge API");
  else fail("Approve merge", await approveRes.text());

  const merged = await prisma.entity.findUnique({ where: { id: rahul2.id } });
  if (merged?.mergedIntoId === rahul1.id || merged?.mergedIntoId === rahul2.id) {
    pass("mergedIntoId set after approve");
  } else {
    fail("mergedIntoId not set");
  }

  const canonicalId = merged?.mergedIntoId === rahul1.id ? rahul1.id : rahul2.id;
  const canonical = await prisma.entity.findUnique({ where: { id: canonicalId } });
  if ((canonical?.rawValues.length ?? 0) >= 2) pass("Raw values merged", canonical?.rawValues.join(", "));
  else fail("Raw values merge");

  const rejectMatch = await prisma.entityMatch.create({
    data: {
      entityAId: idA,
      entityBId: (await prisma.entity.create({
        data: { caseId: testCase.id, type: "PHONE", normalizedValue: "+919999999999", rawValues: ["9999999999"] },
      })).id,
      confidence: 75,
      reasons: ["Test reject"],
    },
  });
  await fetch(`${BASE}/api/entities/matches`, {
    method: "POST",
    headers,
    body: JSON.stringify({ matchId: rejectMatch.id, action: "reject" }),
  });
  const rejected = await prisma.entityMatch.findUnique({ where: { id: rejectMatch.id } });
  if (rejected?.status === "REJECTED") pass("Reject match API");
  else fail("Reject match");

  console.log(`\n=== Results: ${results.filter((r) => r.ok).length}/${results.length} passed ===\n`);
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
