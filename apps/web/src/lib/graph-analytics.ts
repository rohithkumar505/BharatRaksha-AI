import { withNeo4jSession, neoInt } from "./neo4j";
import { prisma } from "./db";

export interface RankedEntity {
  id: string;
  value: string;
  label: string;
  score: number;
  rank: number;
}

export interface CommunityCluster {
  communityId: number;
  size: number;
  members: Array<{ id: string; value: string; label: string }>;
  label: string;
}

export interface BridgeNode {
  id: string;
  value: string;
  label: string;
  betweenness: number;
  connectsCommunities: number;
  reason: string;
}

export interface IntelligenceScore {
  id: string;
  value: string;
  label: string;
  score: number;
  factors: string[];
}

export interface WhatIfResult {
  nodeId: string;
  nodeValue: string;
  componentsBefore: number;
  componentsAfter: number;
  networkSplits: boolean;
  affectedNodes: number;
  explanation: string;
}

export interface CrossCaseLink {
  entityId: string;
  value: string;
  type: string;
  label: string;
  cases: Array<{ caseId: string; caseNumber: string }>;
}

function graphName(caseId: string) {
  return `case_${caseId.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

function safeNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
}

async function dropProjectedGraph(session: import("neo4j-driver").Session, name: string) {
  try {
    const listed = await session.run(`CALL gds.graph.list() YIELD graphName RETURN graphName`);
    const names = listed.records.map((r) => r.get("graphName") as string);
    if (names.includes(name)) {
      await session.run(`CALL gds.graph.drop($name) YIELD graphName`, { name });
    }
  } catch {
    try {
      await session.run(`CALL gds.graph.drop($name, false)`, { name });
    } catch {
      // GDS not available or graph doesn't exist
    }
  }
}

async function projectCaseGraph(session: import("neo4j-driver").Session, caseId: string): Promise<boolean> {
  const name = graphName(caseId);
  await dropProjectedGraph(session, name);

  const countResult = await session.run(
    `MATCH (n) WHERE n.caseId = $caseId RETURN count(n) AS c`,
    { caseId }
  );
  const nodeCount = safeNum(countResult.records[0]?.get("c"));
  if (nodeCount < 2) return false;

  try {
    await session.run(
      `
      MATCH (source) WHERE source.caseId = $caseId
      MATCH (source)-[r]-(target) WHERE target.caseId = $caseId
      WITH gds.graph.project(
        $graphName,
        source,
        target,
        {},
        { undirectedRelationshipTypes: ['*'] }
      ) AS g
      RETURN g.graphName AS name, g.nodeCount AS nodes, g.relationshipCount AS rels
      `,
      { caseId, graphName: name }
    );
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Retry once after forced drop if catalog race left a leftover graph
    if (msg.includes("already exists")) {
      await dropProjectedGraph(session, name);
      try {
        await session.run(
          `
          MATCH (source) WHERE source.caseId = $caseId
          MATCH (source)-[r]-(target) WHERE target.caseId = $caseId
          WITH gds.graph.project(
            $graphName,
            source,
            target,
            {},
            { undirectedRelationshipTypes: ['*'] }
          ) AS g
          RETURN g.graphName AS name
          `,
          { caseId, graphName: name }
        );
        return true;
      } catch (retryErr) {
        console.warn("GDS projection retry failed, using Cypher fallback:", retryErr);
        return false;
      }
    }
    console.warn("GDS projection failed, using Cypher fallback:", err);
    return false;
  }
}

/** Degree centrality — always available via Cypher */
export async function computeDegreeCentrality(caseId: string, limit = 20): Promise<RankedEntity[]> {
  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (n) WHERE n.caseId = $caseId
      OPTIONAL MATCH (n)-[r]-(m) WHERE m.caseId = $caseId
      WITH n, count(DISTINCT r) AS degree
      WHERE degree > 0
      RETURN n.pgId AS id, n.value AS value, labels(n)[0] AS label, degree AS score
      ORDER BY degree DESC
      LIMIT $limit
      `,
      { caseId, limit: neoInt(Math.floor(limit)) }
    );
    return result.records.map((r, i) => ({
      id: r.get("id") as string,
      value: r.get("value") as string,
      label: r.get("label") as string,
      score: safeNum(r.get("score")),
      rank: i + 1,
    }));
  });
}

/** PageRank via Neo4j GDS, fallback to normalized degree */
export async function computePageRank(caseId: string, limit = 20): Promise<RankedEntity[]> {
  return withNeo4jSession(async (session) => {
    const projected = await projectCaseGraph(session, caseId);
    const name = graphName(caseId);

    if (projected) {
      try {
        const result = await session.run(
          `
          CALL gds.pageRank.stream($graphName)
          YIELD nodeId, score
          WITH gds.util.asNode(nodeId) AS n, score
          WHERE n.caseId = $caseId AND n.value IS NOT NULL AND NOT n:Case
          RETURN n.pgId AS id, n.value AS value, labels(n)[0] AS label, score
          ORDER BY score DESC
          LIMIT $limit
          `,
          { graphName: name, caseId, limit: neoInt(Math.floor(limit)) }
        );
        await dropProjectedGraph(session, name);
        if (result.records.length > 0) {
          return result.records.map((r, i) => ({
            id: r.get("id") as string,
            value: (r.get("value") as string) ?? "unknown",
            label: r.get("label") as string,
            score: Math.round(safeNum(r.get("score")) * 10000) / 10000,
            rank: i + 1,
          }));
        }
      } catch (err) {
        console.warn("PageRank GDS failed:", err);
        await dropProjectedGraph(session, name);
      }
    }

    const fallback = await session.run(
      `
      MATCH (n) WHERE n.caseId = $caseId
      OPTIONAL MATCH (n)-[r]-(m) WHERE m.caseId = $caseId
      WITH n, count(DISTINCT m) AS neighbors, count(DISTINCT r) AS degree
      WHERE degree > 0
      WITH n, degree, neighbors,
           toFloat(degree) / (neighbors + 1.0) AS score
      RETURN n.pgId AS id, n.value AS value, labels(n)[0] AS label, score
      ORDER BY score DESC
      LIMIT $limit
      `,
      { caseId, limit: neoInt(Math.floor(limit)) }
    );
    return fallback.records.map((r, i) => ({
      id: r.get("id") as string,
      value: r.get("value") as string,
      label: r.get("label") as string,
      score: Math.round(safeNum(r.get("score")) * 10000) / 10000,
      rank: i + 1,
    }));
  });
}

/** Betweenness centrality via GDS, fallback to bridge heuristic */
export async function computeBetweenness(caseId: string, limit = 15): Promise<RankedEntity[]> {
  return withNeo4jSession(async (session) => {
    const projected = await projectCaseGraph(session, caseId);
    const name = graphName(caseId);

    if (projected) {
      try {
        const result = await session.run(
          `
          CALL gds.betweenness.stream($graphName)
          YIELD nodeId, score
          WITH gds.util.asNode(nodeId) AS n, score
          WHERE n.caseId = $caseId AND score > 0 AND n.value IS NOT NULL AND NOT n:Case
          RETURN n.pgId AS id, n.value AS value, labels(n)[0] AS label, score
          ORDER BY score DESC
          LIMIT $limit
          `,
          { graphName: name, caseId, limit: neoInt(Math.floor(limit)) }
        );
        await dropProjectedGraph(session, name);
        if (result.records.length > 0) {
          return result.records.map((r, i) => ({
            id: r.get("id") as string,
            value: (r.get("value") as string) ?? "unknown",
            label: r.get("label") as string,
            score: Math.round(safeNum(r.get("score")) * 10000) / 10000,
            rank: i + 1,
          }));
        }
      } catch (err) {
        console.warn("Betweenness GDS failed:", err);
        await dropProjectedGraph(session, name);
      }
    }

    const fallback = await session.run(
      `
      MATCH (n) WHERE n.caseId = $caseId
      MATCH (n)-[r]-(m) WHERE m.caseId = $caseId
      WITH n, count(DISTINCT m) AS connections,
           count(DISTINCT labels(m)[0]) AS typeDiversity
      WHERE connections >= 2
      WITH n, connections, typeDiversity,
           toFloat(connections) * typeDiversity AS score
      RETURN n.pgId AS id, n.value AS value, labels(n)[0] AS label, score
      ORDER BY score DESC
      LIMIT $limit
      `,
      { caseId, limit: neoInt(Math.floor(limit)) }
    );
    return fallback.records.map((r, i) => ({
      id: r.get("id") as string,
      value: r.get("value") as string,
      label: r.get("label") as string,
      score: Math.round(safeNum(r.get("score")) * 100) / 100,
      rank: i + 1,
    }));
  });
}

/** Louvain community detection */
export async function computeCommunities(caseId: string): Promise<CommunityCluster[]> {
  return withNeo4jSession(async (session) => {
    const projected = await projectCaseGraph(session, caseId);
    const name = graphName(caseId);

    if (projected) {
      try {
        await session.run(
          `
          CALL gds.louvain.write($graphName, { writeProperty: 'community' })
          YIELD communityCount, modularity
          `,
          { graphName: name }
        );

        const result = await session.run(
          `
          MATCH (n) WHERE n.caseId = $caseId AND n.community IS NOT NULL
          WITH n.community AS communityId, collect({
            id: n.pgId, value: n.value, label: labels(n)[0]
          }) AS members
          RETURN communityId, members, size(members) AS size
          ORDER BY size DESC
          `,
          { caseId }
        );

        await session.run(
          `MATCH (n) WHERE n.caseId = $caseId REMOVE n.community`,
          { caseId }
        );
        await dropProjectedGraph(session, name);

        if (result.records.length > 0) {
          return result.records.map((r) => {
            const raw = (r.get("members") as Array<{ id: string; value: string | null; label: string | null }>) ?? [];
            const members = raw
              .filter((m) => m && m.id)
              .map((m) => ({
                id: String(m.id),
                value: m.value != null ? String(m.value) : "",
                label: m.label != null ? String(m.label) : "Entity",
              }));
            const size = safeNum(r.get("size"));
            const communityId = safeNum(r.get("communityId"));
            const dominant = members[0]?.label || "Entity";
            return {
              communityId,
              size,
              members: members.slice(0, 8),
              label: `${dominant} cluster (${size} nodes)`,
            };
          });
        }
      } catch (err) {
        console.warn("Louvain GDS failed:", err);
        await dropProjectedGraph(session, name);
      }
    }

    const fallback = await session.run(
      `
      MATCH (n) WHERE n.caseId = $caseId
      OPTIONAL MATCH (n)-[r]-(m) WHERE m.caseId = $caseId
      WITH labels(n)[0] AS nodeLabel, collect(DISTINCT {
        id: n.pgId, value: n.value, label: labels(n)[0]
      }) AS members
      WHERE size(members) > 0
      RETURN nodeLabel AS communityId, members, size(members) AS size
      ORDER BY size DESC
      `,
      { caseId }
    );

    return fallback.records.map((r, i) => {
      const raw = (r.get("members") as Array<{ id: string; value: string | null; label: string | null }>) ?? [];
      const members = raw
        .filter((m) => m && m.id)
        .map((m) => ({
          id: String(m.id),
          value: m.value != null ? String(m.value) : "",
          label: m.label != null ? String(m.label) : "Entity",
        }));
      const size = safeNum(r.get("size"));
      const label = String(r.get("communityId") ?? "Entity");
      return {
        communityId: i,
        size,
        members: members.slice(0, 8),
        label: `${label} group (${size} nodes)`,
      };
    });
  });
}

/** Bridge nodes — high betweenness connecting disparate parts */
export async function detectBridgeNodes(caseId: string): Promise<BridgeNode[]> {
  const betweenness = await computeBetweenness(caseId, 10);
  const communities = await computeCommunities(caseId);

  return betweenness.slice(0, 8).map((b) => {
    const communityCount = communities.filter((c) =>
      c.members.some((m) => m.id === b.id)
    ).length;
    return {
      id: b.id,
      value: b.value,
      label: b.label,
      betweenness: b.score,
      connectsCommunities: Math.max(communityCount, 1),
      reason:
        b.score > 5
          ? "High betweenness — potential hidden connector between network segments"
          : "Multi-type connections — links different entity categories",
    };
  });
}

/** Explainable intelligence score per entity */
export async function computeIntelligenceScores(caseId: string, limit = 15): Promise<IntelligenceScore[]> {
  // Sequential: PageRank/Betweenness share Neo4j GDS graph catalog — parallel causes race
  const degree = await computeDegreeCentrality(caseId, limit * 2);
  const pageRank = await computePageRank(caseId, limit * 2);
  const betweenness = await computeBetweenness(caseId, limit * 2);

  const scoreMap = new Map<string, IntelligenceScore>();

  function addScore(
    list: RankedEntity[],
    weight: number,
    factorFn: (rank: number, score: number) => string
  ) {
    const maxRank = list.length || 1;
    for (const item of list) {
      const normalized = ((maxRank - item.rank + 1) / maxRank) * weight;
      const existing = scoreMap.get(item.id);
      const factor = factorFn(item.rank, item.score);
      if (existing) {
        existing.score += normalized;
        if (!existing.factors.includes(factor)) existing.factors.push(factor);
      } else {
        scoreMap.set(item.id, {
          id: item.id,
          value: item.value,
          label: item.label,
          score: normalized,
          factors: [factor],
        });
      }
    }
  }

  addScore(degree, 35, (rank, score) => `${score} direct connections (degree rank #${rank})`);
  addScore(pageRank, 35, (rank) => `High network influence (PageRank rank #${rank})`);
  addScore(betweenness, 30, (rank) => `Bridge position between segments (betweenness rank #${rank})`);

  return [...scoreMap.values()]
    .map((s) => ({ ...s, score: Math.round(s.score * 10) / 10 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** What-if: remove node and check if network splits */
export async function whatIfRemoveNode(caseId: string, nodeId: string): Promise<WhatIfResult> {
  return withNeo4jSession(async (session) => {
    const nodeResult = await session.run(
      `MATCH (n {pgId: $nodeId}) RETURN n.value AS value`,
      { nodeId }
    );
    const nodeValue = (nodeResult.records[0]?.get("value") as string) ?? nodeId;

    const beforeResult = await session.run(
      `
      MATCH (n) WHERE n.caseId = $caseId
      CALL {
        WITH n
        MATCH path = (n)-[*]-(m)
        WHERE m.caseId = $caseId
        RETURN count(DISTINCT n) AS reachable
      }
      WITH count(DISTINCT n) AS totalNodes
      MATCH (n) WHERE n.caseId = $caseId
      OPTIONAL MATCH (n)-[r]-(m) WHERE m.caseId = $caseId
      WITH totalNodes, n, count(DISTINCT m) AS degree
      WITH totalNodes, collect({id: n.pgId, degree: degree}) AS nodes
      RETURN totalNodes, nodes
      `,
      { caseId }
    );

    const totalNodes = safeNum(beforeResult.records[0]?.get("totalNodes"));

    const afterResult = await session.run(
      `
      MATCH (n) WHERE n.caseId = $caseId AND n.pgId <> $nodeId
      OPTIONAL MATCH (n)-[r]-(m)
      WHERE m.caseId = $caseId AND m.pgId <> $nodeId
      WITH n, count(DISTINCT m) AS degree
      RETURN count(n) AS remainingNodes,
             sum(CASE WHEN degree = 0 THEN 1 ELSE 0 END) AS isolatedAfter
      `,
      { caseId, nodeId }
    );

    const remainingNodes = safeNum(afterResult.records[0]?.get("remainingNodes"));
    const isolatedAfter = safeNum(afterResult.records[0]?.get("isolatedAfter"));

    const componentsBefore = await session.run(
      `
      MATCH (n) WHERE n.caseId = $caseId
      RETURN CASE WHEN count(n) = 0 THEN 0 ELSE 1 END AS components
      `,
      { caseId }
    );
    const compBefore = safeNum(componentsBefore.records[0]?.get("components"));

    const componentsAfter = isolatedAfter > 0 ? isolatedAfter + 1 : Math.max(1, compBefore);
    const networkSplits = isolatedAfter > 0 || componentsAfter > compBefore;

    return {
      nodeId,
      nodeValue,
      componentsBefore: compBefore,
      componentsAfter: componentsAfter,
      networkSplits,
      affectedNodes: totalNodes - remainingNodes,
      explanation: networkSplits
        ? `Removing "${nodeValue}" may fragment the network — ${isolatedAfter} node(s) would become isolated. Review recommended before action.`
        : `Removing "${nodeValue}" does not appear to split the main network component.`,
    };
  });
}

/** Find entities appearing in multiple cases */
export async function findCrossCaseLinks(): Promise<CrossCaseLink[]> {
  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (n)
      WHERE n.caseId IS NOT NULL AND n.value IS NOT NULL
      WITH n.value AS value, n.type AS type, labels(n)[0] AS label,
           collect(DISTINCT {caseId: n.caseId, caseNumber: n.caseNumber}) AS cases,
           collect(DISTINCT n.pgId)[0] AS entityId
      WHERE size(cases) > 1
      RETURN entityId, value, type, label, cases
      ORDER BY size(cases) DESC
      LIMIT 50
      `
    );

    return result.records.map((r) => ({
      entityId: r.get("entityId") as string,
      value: r.get("value") as string,
      type: r.get("type") as string,
      label: r.get("label") as string,
      cases: r.get("cases") as Array<{ caseId: string; caseNumber: string }>,
    }));
  });
}

/** Scan for cross-case links and create alerts (batched, max 20 per run) */
export async function scanAndCreateCrossCaseAlerts(): Promise<number> {
  const links = await findCrossCaseLinks();
  let created = 0;

  for (const link of links.slice(0, 20)) {
    // Prefer a caseId that still exists in Postgres (Neo4j can hold stale case refs)
    let validCaseId: string | null = null;
    for (const c of link.cases) {
      if (!c?.caseId) continue;
      const exists = await prisma.case.findUnique({
        where: { id: c.caseId },
        select: { id: true },
      });
      if (exists) {
        validCaseId = exists.id;
        break;
      }
    }
    if (!validCaseId) continue;

    let validEntityId: string | null = null;
    if (link.entityId) {
      const ent = await prisma.entity.findUnique({
        where: { id: link.entityId },
        select: { id: true },
      });
      if (ent) validEntityId = ent.id;
    }
    if (!validEntityId) {
      const byValue = await prisma.entity.findFirst({
        where: {
          caseId: validCaseId,
          normalizedValue: link.value,
          mergedIntoId: null,
        },
        select: { id: true },
      });
      validEntityId = byValue?.id ?? null;
    }

    const existing = await prisma.alert.findFirst({
      where: {
        type: "CROSS_CASE_LINK",
        caseId: validCaseId,
        ...(validEntityId ? { entityId: validEntityId } : {}),
        status: { in: ["NEW", "ACKNOWLEDGED", "INVESTIGATING"] },
      },
    });
    if (existing) continue;

    const caseNumbers = link.cases.map((c) => c.caseNumber).join(", ");
    await prisma.alert.create({
      data: {
        type: "CROSS_CASE_LINK",
        title: `Cross-case link: ${link.label} ${link.value}`,
        message: `Entity "${link.value}" (${link.label}) appears in ${link.cases.length} cases: ${caseNumbers}. Requires cross-case review.`,
        confidence: 0.85,
        caseId: validCaseId,
        entityId: validEntityId,
        metadata: { cases: link.cases, value: link.value, type: link.type },
      },
    });
    created++;
  }

  return created;
}

/** Full analytics bundle for a case — runs sequentially to avoid GDS graph catalog races */
export async function getFullGraphAnalytics(caseId: string) {
  const degree = await computeDegreeCentrality(caseId);
  const pageRank = await computePageRank(caseId);
  const betweenness = await computeBetweenness(caseId);
  const communities = await computeCommunities(caseId);
  const bridges = await detectBridgeNodes(caseId);
  const intelligence = await computeIntelligenceScores(caseId);

  return {
    degree,
    pageRank,
    betweenness,
    communities,
    bridges,
    intelligence,
    topByDegree: degree.slice(0, 10),
    keyConnectors: bridges.slice(0, 10).map((b) => ({
      id: b.id,
      value: b.value,
      label: b.label,
      connections: b.betweenness,
      neighborTypes: [],
    })),
    computedAt: new Date().toISOString(),
  };
}
