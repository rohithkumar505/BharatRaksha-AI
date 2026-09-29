/**
 * Step 8 & 9 verification — Neo4j Graph + Graph Analytics
 * Run: APP_URL=http://localhost:3001 npx tsx scripts/verify-step8-step9.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@bharat-raksha/database";
import { ensureEvidenceProcessed } from "./lib/ingest-helper";
import { syncFullCaseToNeo4j } from "../apps/web/src/lib/neo4j-sync";
import {
  computeDegreeCentrality,
  computePageRank,
  computeBetweenness,
  computeCommunities,
  detectBridgeNodes,
  computeIntelligenceScores,
  whatIfRemoveNode,
  findCrossCaseLinks,
  getFullGraphAnalytics,
} from "../apps/web/src/lib/graph-analytics";

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

async function uploadFile(
  cookie: string,
  caseId: string,
  filePath: string,
  type: string,
  fileName: string
) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(filePath)]), fileName);
  form.append("type", type);
  const res = await fetch(`${BASE}/api/cases/${caseId}/ingest`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
  const { job, evidence } = await res.json();
  await ensureEvidenceProcessed(evidence.id, job.id, 30000);
  return job;
}

async function main() {
  console.log(`\n=== Step 8 & 9 Verification ===`);
  console.log(`App: ${BASE}\n`);

  // Health check
  const health = await fetch(`${BASE}/api/health`);
  if (health.ok) {
    const h = await health.json();
    pass("Health API", `neo4j=${h.checks?.neo4j?.status}`);
  } else {
    fail("Health API");
  }

  const cookie = await login("investigator@bharatraksha.gov.in", "Invest@Bharat2026!");
  const headers = { Cookie: cookie, "Content-Type": "application/json" };

  // Create test case
  const createRes = await fetch(`${BASE}/api/cases`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      crimeType: "Cyber Fraud",
      location: "Bengaluru",
      priority: "HIGH",
      description: "Step 8-9 graph verification case",
    }),
  });
  if (!createRes.ok) {
    fail("Create case", await createRes.text());
    process.exit(1);
  }
  const testCase = await createRes.json();
  pass("Create case", testCase.caseNumber);

  // Upload FIR + CDR for graph data
  try {
    await uploadFile(cookie, testCase.id, join(TESTDATA, "sample_fir.txt"), "FIR", "sample_fir.txt");
    pass("Upload FIR");
  } catch (e) {
    fail("Upload FIR", String(e));
  }

  try {
    await uploadFile(cookie, testCase.id, join(TESTDATA, "sample_cdr.csv"), "CDR", "sample_cdr.csv");
    pass("Upload CDR");
  } catch (e) {
    fail("Upload CDR", String(e));
  }

  try {
    await uploadFile(cookie, testCase.id, join(TESTDATA, "sample_transactions.csv"), "BANK_TXN", "sample_transactions.csv");
    pass("Upload transactions");
  } catch (e) {
    fail("Upload transactions", String(e));
  }

  // Sync to Neo4j
  try {
    const sync = await syncFullCaseToNeo4j(testCase.id);
    if (sync.entities > 0) pass("Neo4j full sync", `${sync.entities} entities, ${sync.relationships} rels`);
    else fail("Neo4j full sync", "no entities");
  } catch (e) {
    fail("Neo4j full sync", String(e));
  }

  // Step 8: Graph API
  const graphRes = await fetch(`${BASE}/api/cases/${testCase.id}/graph?analytics=true&hops=2&evolution=true`, {
    headers: { Cookie: cookie },
  });
  if (graphRes.ok) {
    const graph = await graphRes.json();
    if (graph.nodes?.length > 0) pass("Graph API nodes", `${graph.nodes.length} nodes`);
    else fail("Graph API nodes", "empty");
    if (graph.edges?.length > 0) pass("Graph API edges", `${graph.edges.length} edges`);
    else fail("Graph API edges", "empty (may be ok if only entities)");
    if (graph.analytics) pass("Graph API analytics bundle");
    else fail("Graph API analytics bundle");
    if (Array.isArray(graph.evolution)) pass("Network evolution data");
    else fail("Network evolution data");
  } else {
    fail("Graph API", await graphRes.text());
  }

  // Graph search
  const searchRes = await fetch(`${BASE}/api/cases/${testCase.id}/graph/search?q=91`, {
    headers: { Cookie: cookie },
  });
  if (searchRes.ok) {
    const search = await searchRes.json();
    pass("Graph search API", `${search.results?.length ?? 0} results`);
  } else {
    fail("Graph search API");
  }

  // Graph sync API
  const syncApiRes = await fetch(`${BASE}/api/cases/${testCase.id}/graph/sync`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  if (syncApiRes.ok) {
    const syncData = await syncApiRes.json();
    pass("Graph sync API", `${syncData.entities} entities`);
  } else {
    fail("Graph sync API");
  }

  // Node detail if we have entities
  const entities = await prisma.entity.findMany({ where: { caseId: testCase.id }, take: 2 });
  if (entities.length >= 2) {
    const nodeRes = await fetch(`${BASE}/api/cases/${testCase.id}/graph/node/${entities[0].id}`, {
      headers: { Cookie: cookie },
    });
    if (nodeRes.ok) {
      const node = await nodeRes.json();
      if (node.value) pass("Node detail API", node.value);
      else fail("Node detail API");
    } else {
      fail("Node detail API");
    }

    const pathRes = await fetch(
      `${BASE}/api/cases/${testCase.id}/graph/path?source=${entities[0].id}&target=${entities[1].id}`,
      { headers: { Cookie: cookie } }
    );
    if (pathRes.ok) {
      const path = await pathRes.json();
      pass("Shortest path API", path.found ? `${path.hops} hops` : "no path (ok)");
    } else {
      fail("Shortest path API");
    }

    const rel = await prisma.relationship.findFirst({
      where: { sourceEntity: { caseId: testCase.id } },
    });
    if (rel) {
      const edgeRes = await fetch(`${BASE}/api/cases/${testCase.id}/graph/edge/${rel.id}`, {
        headers: { Cookie: cookie },
      });
      if (edgeRes.ok) {
        const edge = await edgeRes.json();
        pass("Edge provenance API", edge.relationType);
      } else {
        fail("Edge provenance API");
      }
    }
  } else {
    fail("Entities for path/node tests", `${entities.length} found`);
  }

  // Step 9: Analytics lib
  try {
    const degree = await computeDegreeCentrality(testCase.id);
    if (degree.length > 0) pass("Degree centrality", `top: ${degree[0].value} (${degree[0].score})`);
    else fail("Degree centrality", "empty");
  } catch (e) {
    fail("Degree centrality", String(e));
  }

  try {
    const pr = await computePageRank(testCase.id);
    if (pr.length > 0) pass("PageRank", `top: ${pr[0].value}`);
    else fail("PageRank", "empty");
  } catch (e) {
    fail("PageRank", String(e));
  }

  try {
    const bet = await computeBetweenness(testCase.id);
    pass("Betweenness centrality", `${bet.length} nodes ranked`);
  } catch (e) {
    fail("Betweenness centrality", String(e));
  }

  try {
    const comm = await computeCommunities(testCase.id);
    if (comm.length > 0) pass("Louvain communities", `${comm.length} clusters`);
    else fail("Louvain communities", "empty");
  } catch (e) {
    fail("Louvain communities", String(e));
  }

  try {
    const bridges = await detectBridgeNodes(testCase.id);
    pass("Bridge node detection", `${bridges.length} bridges`);
  } catch (e) {
    fail("Bridge node detection", String(e));
  }

  try {
    const intel = await computeIntelligenceScores(testCase.id);
    if (intel.length > 0 && intel[0].factors.length > 0) {
      pass("Intelligence scores", `top: ${intel[0].value} score=${intel[0].score}`);
    } else {
      fail("Intelligence scores", "empty or no factors");
    }
  } catch (e) {
    fail("Intelligence scores", String(e));
  }

  if (entities.length > 0) {
    try {
      const whatIf = await whatIfRemoveNode(testCase.id, entities[0].id);
      if (whatIf.explanation) pass("What-if analysis", whatIf.networkSplits ? "splits" : "connected");
      else fail("What-if analysis");
    } catch (e) {
      fail("What-if analysis", String(e));
    }

    const whatIfApi = await fetch(`${BASE}/api/cases/${testCase.id}/graph/what-if`, {
      method: "POST",
      headers,
      body: JSON.stringify({ nodeId: entities[0].id }),
    });
    if (whatIfApi.ok) pass("What-if API");
    else fail("What-if API");
  }

  // Analytics API
  const analyticsRes = await fetch(`${BASE}/api/cases/${testCase.id}/graph/analytics`, {
    headers: { Cookie: cookie },
  });
  if (analyticsRes.ok) {
    const a = await analyticsRes.json();
    if (a.intelligence && a.pageRank && a.communities) pass("Analytics API full bundle");
    else fail("Analytics API full bundle");
  } else {
    fail("Analytics API");
  }

  // Cross-case (create second case with same phone if possible)
  const crossRes = await fetch(`${BASE}/api/graph/cross-case`, { headers: { Cookie: cookie } });
  if (crossRes.ok) {
    const cross = await crossRes.json();
    pass("Cross-case links API", `${cross.count} links`);
  } else {
    fail("Cross-case links API");
  }

  try {
    const links = await findCrossCaseLinks();
    pass("Cross-case lib", `${links.length} links`);
  } catch (e) {
    fail("Cross-case lib", String(e));
  }

  const full = await getFullGraphAnalytics(testCase.id);
  if (full.computedAt) pass("Full analytics bundle");

  // Cleanup
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
