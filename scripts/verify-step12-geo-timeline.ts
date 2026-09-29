/**
 * Step 12 verification — Geo + Timeline Intelligence
 * Run: APP_URL=http://localhost:3001 npx tsx scripts/verify-step12-geo-timeline.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@bharat-raksha/database";
import { ensureEvidenceProcessed } from "./lib/ingest-helper";
import {
  geocodeAddress,
  getMapData,
  getUnifiedTimeline,
  buildMovementPaths,
  detectCommonLocations,
  detectHotspots,
  detectCorrelatedSequences,
  createGeoAlerts,
} from "../apps/web/src/lib/geo-intelligence";

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

async function upload(
  cookie: string,
  caseId: string,
  filePath: string,
  fileName: string,
  type: string
) {
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
  console.log(`\n=== Step 12 Geo + Timeline Verification ===`);
  console.log(`App: ${BASE}\n`);

  const cookie = await login();
  const headers = { Cookie: cookie, "Content-Type": "application/json" };

  // Unit: geocode tower fallback
  const mgRoad = await geocodeAddress("MG Road Tower");
  if (mgRoad && mgRoad.lat > 12 && mgRoad.lng > 77) pass("Geocode tower fallback", `${mgRoad.lat}, ${mgRoad.lng}`);
  else fail("Geocode tower fallback");

  const createRes = await fetch(`${BASE}/api/cases`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      crimeType: "Organized Crime",
      location: "Bengaluru",
      priority: "HIGH",
      description: "Step 12 geo timeline verification",
    }),
  });
  if (!createRes.ok) {
    fail("Create case", await createRes.text());
    process.exit(1);
  }
  const testCase = await createRes.json();
  pass("Create case", testCase.caseNumber);

  try {
    await upload(cookie, testCase.id, join(TESTDATA, "sample_cdr.csv"), "sample_cdr.csv", "CDR");
    pass("Upload CDR");
  } catch (e) {
    fail("Upload CDR", String(e));
  }

  try {
    await upload(cookie, testCase.id, join(TESTDATA, "sample_tower.csv"), "sample_tower.csv", "TOWER");
    pass("Upload tower/location logs");
  } catch (e) {
    fail("Upload tower/location logs", String(e));
  }

  try {
    await upload(cookie, testCase.id, join(TESTDATA, "sample_transactions_aml.csv"), "sample_txn.csv", "BANK_TXN");
    pass("Upload bank transactions");
  } catch (e) {
    fail("Upload bank transactions", String(e));
  }

  const locEvents = await prisma.locationEvent.count({ where: { caseId: testCase.id } });
  if (locEvents >= 4) pass("Location events in DB", `${locEvents} events`);
  else fail("Location events in DB", `${locEvents} events`);

  const mapData = await getMapData(testCase.id);
  if (mapData.markers.length > 0) pass("Map markers generated", `${mapData.markers.length} markers`);
  else fail("Map markers generated");

  if (mapData.center.lat > 10 && mapData.center.lng > 70) pass("Map center in India region");
  else fail("Map center in India region");

  if (mapData.paths.length > 0) pass("Movement paths", `${mapData.paths.length} paths`);
  else fail("Movement paths");

  if (mapData.commonLocations.length > 0) {
    pass("Common locations detected", `${mapData.commonLocations.length} locations`);
  } else fail("Common locations detected");

  if (mapData.hotspots.length > 0) pass("Hotspots detected", `${mapData.hotspots.length} hotspots`);
  else fail("Hotspots detected");

  const timeline = await getUnifiedTimeline(testCase.id);
  if (timeline.events.length > 0) pass("Unified timeline events", `${timeline.events.length} events`);
  else fail("Unified timeline events");

  const types = new Set(timeline.events.map((e) => e.type));
  if (types.has("CALL")) pass("Timeline includes CALL events");
  else fail("Timeline includes CALL events");
  if (types.has("LOCATION")) pass("Timeline includes LOCATION events");
  else fail("Timeline includes LOCATION events");
  if (types.has("TRANSACTION")) pass("Timeline includes TRANSACTION events");
  else fail("Timeline includes TRANSACTION events");

  if (timeline.summary.totalEvents === timeline.events.length) pass("Timeline summary counts");
  else fail("Timeline summary counts");

  // Pure function tests
  const mockPoints = mapData.markers;
  const paths = buildMovementPaths(mockPoints);
  if (paths.length > 0) pass("buildMovementPaths()", `${paths[0].distanceKm}km for ${paths[0].entityRef}`);
  else fail("buildMovementPaths()");

  const common = detectCommonLocations(mockPoints);
  if (common.length > 0) pass("detectCommonLocations()", common[0].entities.join(","));
  else fail("detectCommonLocations()");

  const hotspots = detectHotspots(mockPoints);
  if (hotspots.length > 0) pass("detectHotspots()", `intensity ${hotspots[0].intensity}`);
  else fail("detectHotspots()");

  const mockSeq = detectCorrelatedSequences([
    { id: "1", type: "CALL", timestamp: "2026-01-01T10:00:00Z", summary: "call" },
    { id: "2", type: "TRANSACTION", timestamp: "2026-01-01T10:05:00Z", summary: "txn" },
    { id: "3", type: "CALL", timestamp: "2026-01-01T10:10:00Z", summary: "call2" },
  ]);
  if (mockSeq.some((s) => s.pattern === "CALL→TRANSFER→CALL")) pass("detectCorrelatedSequences CALL→TRANSFER→CALL");
  else fail("detectCorrelatedSequences CALL→TRANSFER→CALL");

  const alerts = await createGeoAlerts(testCase.id);
  if (alerts >= 0) pass("createGeoAlerts()", `${alerts} new alerts`);

  // API tests
  const mapRes = await fetch(`${BASE}/api/cases/${testCase.id}/map-data`, { headers: { Cookie: cookie } });
  if (mapRes.ok) {
    const apiMap = await mapRes.json();
    if (apiMap.markers?.length > 0) pass("GET /map-data API", `${apiMap.markers.length} markers`);
    else fail("GET /map-data API");
  } else fail("GET /map-data API", await mapRes.text());

  const tlRes = await fetch(`${BASE}/api/cases/${testCase.id}/timeline`, { headers: { Cookie: cookie } });
  if (tlRes.ok) {
    const apiTl = await tlRes.json();
    if (apiTl.events?.length > 0) pass("GET /timeline API", `${apiTl.events.length} events`);
    else fail("GET /timeline API");
  } else fail("GET /timeline API", await tlRes.text());

  const postRes = await fetch(`${BASE}/api/cases/${testCase.id}/map-data`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  if (postRes.ok) {
    const postData = await postRes.json();
    pass("POST /map-data (geocode+analyze)", `geocoded=${postData.geocoded}`);
  } else fail("POST /map-data", await postRes.text());

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n=== ${passed}/${total} checks passed ===\n`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
