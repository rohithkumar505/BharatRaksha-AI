import { withNeo4jSession, neoInt } from "./neo4j";
import { prisma } from "./db";
import { getFullGraphAnalytics } from "./graph-analytics";

const NODE_LABEL_MAP: Record<string, string> = {
  PERSON: "Person",
  PHONE: "Phone",
  EMAIL: "Email",
  UPI: "Upi",
  BANK_ACCOUNT: "BankAccount",
  IFSC: "Ifsc",
  VEHICLE: "Vehicle",
  ADDRESS: "Address",
  LOCATION: "Location",
  ORGANIZATION: "Organization",
  SOCIAL_HANDLE: "SocialAccount",
  IP_ADDRESS: "IpAddress",
  DOMAIN: "Domain",
  CRYPTO_WALLET: "CryptoWallet",
  DEVICE: "Device",
};

export { NODE_LABEL_MAP };

export async function syncCaseNodeToNeo4j(caseId: string) {
  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseData) return;

  await withNeo4jSession(async (session) => {
    await session.run(
      `
      MERGE (c:Case {pgId: $caseId})
      SET c.caseNumber = $caseNumber,
          c.crimeType = $crimeType,
          c.status = $status,
          c.caseId = $caseId,
          c.updatedAt = datetime()
      `,
      {
        caseId,
        caseNumber: caseData.caseNumber,
        crimeType: caseData.crimeType,
        status: caseData.status,
      }
    );
  });
}

export async function syncEntityToNeo4j(entityId: string) {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    include: { case: true },
  });
  if (!entity || entity.mergedIntoId) return;

  const label = NODE_LABEL_MAP[entity.type] ?? "Entity";

  const nodeId = await withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MERGE (n:${label} {pgId: $pgId})
      SET n.value = $value,
          n.type = $type,
          n.caseId = $caseId,
          n.caseNumber = $caseNumber,
          n.confidence = $confidence,
          n.createdAt = $createdAt,
          n.updatedAt = datetime()
      WITH n
      MATCH (c:Case {pgId: $caseId})
      MERGE (n)-[:APPEARED_IN]->(c)
      RETURN elementId(n) AS nodeId
      `,
      {
        pgId: entity.id,
        value: entity.normalizedValue,
        type: entity.type,
        caseId: entity.caseId,
        caseNumber: entity.case.caseNumber,
        confidence: entity.confidence,
        createdAt: entity.createdAt.toISOString(),
      }
    );
    return result.records[0]?.get("nodeId") as string;
  });

  if (nodeId) {
    await prisma.entity.update({
      where: { id: entity.id },
      data: { neo4jNodeId: nodeId },
    });
  }

  return nodeId;
}

export async function syncRelationshipToNeo4j(relationshipId: string) {
  const rel = await prisma.relationship.findUnique({
    where: { id: relationshipId },
    include: {
      sourceEntity: true,
      targetEntity: true,
      evidence: true,
    },
  });
  if (!rel) return;

  await syncEntityToNeo4j(rel.sourceEntityId);
  await syncEntityToNeo4j(rel.targetEntityId);

  const sourceLabel = NODE_LABEL_MAP[rel.sourceEntity.type] ?? "Entity";
  const targetLabel = NODE_LABEL_MAP[rel.targetEntity.type] ?? "Entity";
  const relType = rel.relationType.toUpperCase().replace(/[^A-Z0-9_]/g, "_");

  const edgeId = await withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (a:${sourceLabel} {pgId: $sourceId})
      MATCH (b:${targetLabel} {pgId: $targetId})
      MERGE (a)-[r:${relType} {pgId: $relId}]->(b)
      SET r.confidence = $confidence,
          r.evidenceId = $evidenceId,
          r.recordRef = $recordRef,
          r.approved = $approved,
          r.sourceFile = $sourceFile,
          r.createdAt = $createdAt,
          r.updatedAt = datetime()
      RETURN elementId(r) AS edgeId
      `,
      {
        sourceId: rel.sourceEntityId,
        targetId: rel.targetEntityId,
        relId: rel.id,
        confidence: rel.confidence,
        evidenceId: rel.evidenceId,
        recordRef: rel.recordRef,
        approved: rel.approved,
        sourceFile: rel.evidence?.fileName ?? null,
        createdAt: rel.createdAt.toISOString(),
      }
    );
    return result.records[0]?.get("edgeId") as string;
  });

  if (edgeId) {
    await prisma.relationship.update({
      where: { id: rel.id },
      data: { neo4jEdgeId: edgeId },
    });
  }
}

/** Bulk sync all entities and relationships for a case */
export async function syncFullCaseToNeo4j(caseId: string) {
  await syncCaseNodeToNeo4j(caseId);

  const entities = await prisma.entity.findMany({
    where: { caseId, mergedIntoId: null },
  });
  for (const entity of entities) {
    await syncEntityToNeo4j(entity.id);
  }

  const relationships = await prisma.relationship.findMany({
    where: {
      sourceEntity: { caseId },
    },
  });
  for (const rel of relationships) {
    await syncRelationshipToNeo4j(rel.id);
  }

  return { entities: entities.length, relationships: relationships.length };
}

function clampHops(hops: number) {
  return Math.min(Math.max(Math.floor(hops), 1), 3);
}

export async function getCaseGraph(
  caseId: string,
  hops = 2,
  centerNodeId?: string,
  pagination?: { nodeLimit?: number; nodeOffset?: number }
) {
  const safeHops = clampHops(hops);
  const nodeLimit = pagination?.nodeLimit ?? 1000;
  const nodeOffset = pagination?.nodeOffset ?? 0;

  const result = await withNeo4jSession(async (session) => {
    if (centerNodeId) {
      const result = await session.run(
        `
        MATCH (center {pgId: $centerNodeId}) WHERE center.caseId = $caseId
        CALL {
          WITH center
          MATCH path = (center)-[*0..${safeHops}]-(m)
          WHERE m.caseId = $caseId
          RETURN collect(DISTINCT m) AS nodes, collect(DISTINCT relationships(path)) AS rels
        }
        UNWIND nodes AS n
        WITH collect(DISTINCT n) AS allNodes, rels
        UNWIND rels AS r
        WITH allNodes, collect(DISTINCT r) AS allRels
        RETURN
          [n IN allNodes | {
            id: n.pgId, label: labels(n)[0], value: n.value,
            type: n.type, confidence: n.confidence
          }] AS nodes,
          [r IN allRels WHERE r IS NOT NULL | {
            id: r.pgId, source: startNode(r).pgId, target: endNode(r).pgId,
            type: type(r), confidence: r.confidence, evidenceId: r.evidenceId,
            recordRef: r.recordRef, approved: r.approved, sourceFile: r.sourceFile
          }] AS edges
        `,
        { caseId, centerNodeId }
      );

      if (result.records.length > 0) {
        return {
          nodes: result.records[0]?.get("nodes") ?? [],
          edges: result.records[0]?.get("edges") ?? [],
        };
      }
    }

    const result = await session.run(
      `
      MATCH (n) WHERE n.caseId = $caseId
      OPTIONAL MATCH (n)-[r]-(m) WHERE m.caseId = $caseId
      WITH collect(DISTINCT n) AS nodes,
           [rel IN collect(DISTINCT r) WHERE rel IS NOT NULL] AS rels
      RETURN
        [node IN nodes | {
          id: node.pgId, label: labels(node)[0], value: node.value,
          type: node.type, confidence: node.confidence
        }] AS nodes,
        [rel IN rels | {
          id: rel.pgId, source: startNode(rel).pgId, target: endNode(rel).pgId,
          type: type(rel), confidence: rel.confidence, evidenceId: rel.evidenceId,
          recordRef: rel.recordRef, approved: rel.approved, sourceFile: rel.sourceFile
        }] AS edges
      `,
      { caseId }
    );

    return {
      nodes: result.records[0]?.get("nodes") ?? [],
      edges: result.records[0]?.get("edges") ?? [],
    };
  });

  const allNodes = result.nodes ?? [];
  const allEdges = result.edges ?? [];
  const nodeIds = new Set(
    allNodes.slice(nodeOffset, nodeOffset + nodeLimit).map((n: { id: string }) => n.id)
  );
  const paginatedNodes = allNodes.slice(nodeOffset, nodeOffset + nodeLimit);
  const paginatedEdges = allEdges.filter(
    (e: { source: string; target: string }) => nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  return {
    nodes: paginatedNodes,
    edges: paginatedEdges,
    pagination: {
      totalNodes: allNodes.length,
      totalEdges: allEdges.length,
      nodeLimit,
      nodeOffset,
      hasMore: nodeOffset + nodeLimit < allNodes.length,
      returnedNodes: paginatedNodes.length,
      returnedEdges: paginatedEdges.length,
    },
  };
}

export async function searchGraph(caseId: string, query: string, limit = 20) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (n) WHERE n.caseId = $caseId
        AND (toLower(n.value) CONTAINS $q OR toLower(labels(n)[0]) CONTAINS $q)
      OPTIONAL MATCH (n)-[r]-(m) WHERE m.caseId = $caseId
      WITH n, count(DISTINCT m) AS connections
      RETURN n.pgId AS id, n.value AS value, labels(n)[0] AS label,
             n.type AS type, n.confidence AS confidence, connections
      ORDER BY connections DESC
      LIMIT $limit
      `,
      { caseId, q, limit: neoInt(Math.floor(limit)) }
    );

    return result.records.map((r) => ({
      id: r.get("id") as string,
      value: r.get("value") as string,
      label: r.get("label") as string,
      type: r.get("type") as string,
      confidence: r.get("confidence") as number,
      connections: (r.get("connections") as { toNumber?: () => number })?.toNumber?.() ?? r.get("connections"),
    }));
  });
}

export async function findShortestPath(caseId: string, sourceId: string, targetId: string) {
  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (a {pgId: $sourceId}), (b {pgId: $targetId})
      WHERE a.caseId = $caseId AND b.caseId = $caseId
      MATCH path = shortestPath((a)-[*..6]-(b))
      RETURN
        [n IN nodes(path) | {
          id: n.pgId, label: labels(n)[0], value: n.value, type: n.type
        }] AS nodes,
        [r IN relationships(path) | {
          id: r.pgId, source: startNode(r).pgId, target: endNode(r).pgId,
          type: type(r), evidenceId: r.evidenceId, recordRef: r.recordRef
        }] AS edges,
        length(path) AS hops
      `,
      { caseId, sourceId, targetId }
    );

    if (result.records.length === 0) {
      return { found: false, nodes: [], edges: [], hops: 0 };
    }

    return {
      found: true,
      nodes: result.records[0]?.get("nodes") ?? [],
      edges: result.records[0]?.get("edges") ?? [],
      hops: result.records[0]?.get("hops")?.toNumber?.() ?? result.records[0]?.get("hops"),
    };
  });
}

export async function getNodeDetail(nodeId: string) {
  const entity = await prisma.entity.findUnique({
    where: { id: nodeId },
    include: {
      case: { select: { id: true, caseNumber: true, crimeType: true } },
      evidence: { select: { id: true, fileName: true, type: true } },
      sourceRelationships: {
        include: { targetEntity: { select: { id: true, normalizedValue: true, type: true } } },
        take: 20,
      },
      targetRelationships: {
        include: { sourceEntity: { select: { id: true, normalizedValue: true, type: true } } },
        take: 20,
      },
    },
  });

  const graphStats = await withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (n {pgId: $nodeId})
      OPTIONAL MATCH (n)-[r]-(m)
      WITH n, count(DISTINCT m) AS connections,
           collect(DISTINCT type(r)) AS relTypes,
           collect(DISTINCT labels(m)[0]) AS neighborTypes
      RETURN n.value AS value, labels(n)[0] AS label, n.type AS type,
             n.confidence AS confidence, n.caseNumber AS caseNumber,
             connections, relTypes, neighborTypes
      `,
      { nodeId }
    );
    return result.records[0];
  });

  const connections = graphStats?.get("connections");
  const connNum = connections?.toNumber?.() ?? connections ?? 0;

  return {
    id: nodeId,
    value: entity?.normalizedValue ?? graphStats?.get("value"),
    type: entity?.type ?? graphStats?.get("type"),
    label: graphStats?.get("label"),
    confidence: entity?.confidence ?? graphStats?.get("confidence"),
    case: entity?.case,
    evidence: entity?.evidence,
    connections: connNum,
    relationshipTypes: graphStats?.get("relTypes") ?? [],
    neighborTypes: graphStats?.get("neighborTypes") ?? [],
    outgoing: entity?.sourceRelationships.map((r) => ({
      id: r.id,
      type: r.relationType,
      target: r.targetEntity,
      evidenceId: r.evidenceId,
      recordRef: r.recordRef,
      confidence: r.confidence,
    })),
    incoming: entity?.targetRelationships.map((r) => ({
      id: r.id,
      type: r.relationType,
      source: r.sourceEntity,
      evidenceId: r.evidenceId,
      recordRef: r.recordRef,
      confidence: r.confidence,
    })),
  };
}

export async function getEdgeProvenance(relationshipId: string) {
  const rel = await prisma.relationship.findUnique({
    where: { id: relationshipId },
    include: {
      sourceEntity: { select: { normalizedValue: true, type: true } },
      targetEntity: { select: { normalizedValue: true, type: true } },
      evidence: {
        select: {
          id: true,
          fileName: true,
          type: true,
          sha256Hash: true,
          createdAt: true,
          uploadedBy: { select: { name: true } },
        },
      },
    },
  });

  if (!rel) {
    const neoRel = await withNeo4jSession(async (session) => {
      const result = await session.run(
        `
        MATCH ()-[r {pgId: $relId}]-()
        RETURN r.evidenceId AS evidenceId, r.recordRef AS recordRef,
               r.confidence AS confidence, r.sourceFile AS sourceFile,
               type(r) AS relType, r.approved AS approved
        `,
        { relId: relationshipId }
      );
      return result.records[0];
    });
    if (!neoRel) return null;

    const evidenceId = neoRel.get("evidenceId") as string | null;
    const evidence = evidenceId
      ? await prisma.evidence.findUnique({
          where: { id: evidenceId },
          include: { uploadedBy: { select: { name: true } } },
        })
      : null;

    return {
      relationshipId,
      relationType: neoRel.get("relType"),
      recordRef: neoRel.get("recordRef"),
      confidence: neoRel.get("confidence"),
      approved: neoRel.get("approved"),
      sourceFile: neoRel.get("sourceFile"),
      evidence,
    };
  }

  return {
    relationshipId: rel.id,
    relationType: rel.relationType,
    recordRef: rel.recordRef,
    confidence: rel.confidence,
    approved: rel.approved,
    sourceEntity: rel.sourceEntity,
    targetEntity: rel.targetEntity,
    evidence: rel.evidence,
    metadata: rel.metadata,
  };
}

export async function getNetworkEvolution(caseId: string) {
  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (n) WHERE n.caseId = $caseId AND n.createdAt IS NOT NULL
      WITH substring(n.createdAt, 0, 10) AS date, count(n) AS nodeCount
      RETURN date, nodeCount
      ORDER BY date ASC
      `,
      { caseId }
    );

    let cumulative = 0;
    return result.records.map((r) => {
      const added = r.get("nodeCount")?.toNumber?.() ?? r.get("nodeCount") ?? 0;
      cumulative += added;
      return {
        date: r.get("date") as string,
        nodesAdded: added,
        cumulativeNodes: cumulative,
      };
    });
  });
}

export async function getGraphAnalytics(caseId: string) {
  return getFullGraphAnalytics(caseId);
}
