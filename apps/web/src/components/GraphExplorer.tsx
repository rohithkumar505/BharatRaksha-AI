"use client";

import { useState, useEffect, useCallback } from "react";
import { NetworkGraph, GraphNode, GraphEdge } from "./NetworkGraph";
import { GraphAnalyticsPanel } from "./GraphAnalyticsPanel";
import { EvidenceProvenanceDrawer } from "./EvidenceProvenanceDrawer";
import {
  Search,
  RefreshCw,
  GitBranch,
  ZoomIn,
  Route,
  X,
  Loader2,
} from "lucide-react";
import { forceRerunLabel, useInvestigationMode } from "@/hooks/useInvestigationMode";

interface Analytics {
  degree?: Array<{ id: string; value: string; label: string; score: number; rank: number }>;
  pageRank?: Array<{ id: string; value: string; label: string; score: number; rank: number }>;
  betweenness?: Array<{ id: string; value: string; label: string; score: number; rank: number }>;
  communities?: Array<{
    communityId: number;
    size: number;
    label: string;
    members: Array<{ id: string; value: string; label: string }>;
  }>;
  bridges?: Array<{ id: string; value: string; label: string; betweenness: number; reason: string }>;
  intelligence?: Array<{ id: string; value: string; label: string; score: number; factors: string[] }>;
  topByDegree?: Array<{ id: string; value: string; label: string; degree: number }>;
  keyConnectors?: Array<{ id: string; value: string; label: string; connections: number }>;
}

interface NodeDetail {
  id: string;
  value: string;
  type?: string;
  label?: string;
  confidence?: number;
  connections?: number;
  relationshipTypes?: string[];
  neighborTypes?: string[];
  case?: { caseNumber: string; crimeType: string };
  evidence?: { fileName: string; type: string };
  outgoing?: Array<{ type: string; target: { normalizedValue: string; type: string } }>;
  incoming?: Array<{ type: string; source: { normalizedValue: string; type: string } }>;
}

interface Provenance {
  relationshipId: string;
  relationType: string;
  recordRef?: string;
  confidence?: number;
  approved?: boolean;
  sourceFile?: string;
  sourceEntity?: { normalizedValue: string; type: string };
  targetEntity?: { normalizedValue: string; type: string };
  evidence?: {
    id: string;
    fileName: string;
    type: string;
    sha256Hash: string;
    uploadedBy?: { name: string };
  };
}

interface Props {
  caseId: string;
  height?: number;
}

export function GraphExplorer({ caseId, height = 580 }: Props) {
  const mode = useInvestigationMode(caseId);
  const [hops, setHops] = useState(2);
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    nodes: [],
    edges: [],
  });
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [evolution, setEvolution] = useState<
    Array<{ date: string; cumulativeNodes: number; nodesAdded: number }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<GraphNode & { connections?: number }>>([]);
  const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Provenance | null>(null);
  const [pathSource, setPathSource] = useState("");
  const [pathTarget, setPathTarget] = useState("");
  const [pathResult, setPathResult] = useState<{ found: boolean; hops: number } | null>(null);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [centerNode, setCenterNode] = useState<string | undefined>();
  const [cdrOverlay, setCdrOverlay] = useState(false);
  const [cdrGraph, setCdrGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const [financialOverlay, setFinancialOverlay] = useState(false);
  const [financialGraph, setFinancialGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);

  const communityMap: Record<string, number> = {};
  analytics?.communities?.forEach((c) => {
    c.members.forEach((m) => {
      communityMap[m.id] = c.communityId;
    });
  });

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        analytics: "true",
        evolution: "true",
        hops: String(hops),
      });
      if (centerNode) params.set("centerNode", centerNode);

      const res = await fetch(`/api/cases/${caseId}/graph?${params}`);
      const data = await res.json();
      setGraph({ nodes: data.nodes ?? [], edges: data.edges ?? [] });
      setAnalytics(data.analytics ?? null);
      setEvolution(
        (data.evolution ?? []).map(
          (
            e: { date: string; cumulativeNodes: number; nodesAdded?: number },
            i: number,
            arr: Array<{ date: string; cumulativeNodes: number; nodesAdded?: number }>
          ) => ({
            date: e.date,
            cumulativeNodes: e.cumulativeNodes,
            nodesAdded:
              typeof e.nodesAdded === "number"
                ? e.nodesAdded
                : i === 0
                  ? e.cumulativeNodes
                  : Math.max(0, e.cumulativeNodes - (arr[i - 1]?.cumulativeNodes ?? 0)),
          })
        )
      );
    } finally {
      setLoading(false);
    }
  }, [caseId, hops, centerNode]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  useEffect(() => {
    if (financialOverlay) {
      fetch(`/api/cases/${caseId}/financial?subgraph=true`)
        .then((r) => r.json())
        .then((d) => {
          const sg = d.subgraph ?? d;
          setFinancialGraph({
            nodes: (sg.nodes ?? []).map((n: GraphNode & { type: string }) => ({
              id: n.id,
              label: n.type ?? n.label,
              value: n.value,
              type: n.type,
            })),
            edges: (sg.edges ?? []).map((e: GraphEdge) => ({ ...e, type: e.type })),
          });
        });
    } else {
      setFinancialGraph(null);
    }
  }, [financialOverlay, caseId]);

  useEffect(() => {
    if (cdrOverlay) {
      fetch(`/api/cases/${caseId}/communication?subgraph=true`)
        .then((r) => r.json())
        .then((d) => {
          const sg = d.subgraph ?? d;
          setCdrGraph({
            nodes: (sg.nodes ?? []).map((n: GraphNode & { type: string }) => ({
              id: n.id,
              label: n.type ?? n.label,
              value: n.value,
              type: n.type,
            })),
            edges: (sg.edges ?? []).map((e: GraphEdge) => ({
              ...e,
              type: e.type,
            })),
          });
        });
    } else {
      setCdrGraph(null);
    }
  }, [cdrOverlay, caseId]);

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch(`/api/cases/${caseId}/graph/sync`, { method: "POST" });
      await loadGraph();
    } finally {
      setSyncing(false);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const res = await fetch(
      `/api/cases/${caseId}/graph/search?q=${encodeURIComponent(searchQuery)}`
    );
    const data = await res.json();
    setSearchResults(data.results ?? []);
  }

  async function handleNodeClick(node: GraphNode) {
    const res = await fetch(`/api/cases/${caseId}/graph/node/${node.id}`);
    if (res.ok) {
      const detail = await res.json();
      setSelectedNode(detail);
      setSelectedEdge(null);
    }
  }

  async function handleEdgeClick(edge: GraphEdge) {
    const res = await fetch(`/api/cases/${caseId}/graph/edge/${edge.id}`);
    if (res.ok) {
      const prov = await res.json();
      setSelectedEdge(prov);
      setSelectedNode(null);
    }
  }

  async function handleFindPath() {
    if (!pathSource || !pathTarget) return;
    const res = await fetch(
      `/api/cases/${caseId}/graph/path?source=${pathSource}&target=${pathTarget}`
    );
    const data = await res.json();
    setPathResult({ found: data.found, hops: data.hops });
    if (data.found) {
      setGraph({ nodes: data.nodes, edges: data.edges });
      setHighlightIds(data.nodes.map((n: GraphNode) => n.id));
    }
  }

  function expandFromNode(nodeId: string) {
    setCenterNode(nodeId);
    setHighlightIds([nodeId]);
  }

  function resetView() {
    setCenterNode(undefined);
    setHighlightIds([]);
    setPathResult(null);
    loadGraph();
  }

  return (
    <div>
      {/* Toolbar */}
      <div
        className="card"
        style={{
          marginBottom: "1rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
          padding: "0.75rem 1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ZoomIn size={14} style={{ color: "var(--text-secondary)" }} />
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Hops:</span>
          {[1, 2, 3].map((h) => (
            <button
              key={h}
              className="btn"
              style={{
                padding: "0.2rem 0.6rem",
                fontSize: "0.75rem",
                background: hops === h ? "var(--accent)" : "transparent",
                color: hops === h ? "white" : "var(--text-secondary)",
                border: hops === h ? "none" : "1px solid var(--border)",
              }}
              onClick={() => { setHops(h); setCenterNode(undefined); }}
            >
              {h}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ color: "var(--text-secondary)" }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search entities (phone, name, account...)"
            style={{ flex: 1, fontSize: "0.8rem" }}
          />
          <button className="btn btn-secondary" onClick={handleSearch} style={{ fontSize: "0.75rem" }}>
            Search
          </button>
        </div>

        <button
          className="btn btn-secondary"
          onClick={handleSync}
          disabled={syncing}
          style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: 4 }}
        >
          {syncing ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
          {forceRerunLabel(mode, "Sync Graph")}
        </button>

        <button
          className="btn btn-secondary"
          onClick={() => { setFinancialOverlay(!financialOverlay); if (!financialOverlay) setCdrOverlay(false); }}
          style={{
            fontSize: "0.75rem",
            background: financialOverlay ? "#f59e0b" : undefined,
            color: financialOverlay ? "white" : undefined,
          }}
        >
          {financialOverlay ? "Money Flow ON" : "Money Flow"}
        </button>

        <button
          className="btn btn-secondary"
          onClick={() => { setCdrOverlay(!cdrOverlay); if (!cdrOverlay) setFinancialOverlay(false); }}
          style={{
            fontSize: "0.75rem",
            background: cdrOverlay ? "var(--success)" : undefined,
            color: cdrOverlay ? "white" : undefined,
          }}
        >
          {cdrOverlay ? "CDR Layer ON" : "CDR Overlay"}
        </button>

        <button
          className="btn btn-secondary"
          onClick={() => setShowAnalytics(!showAnalytics)}
          style={{ fontSize: "0.75rem" }}
        >
          {showAnalytics ? "Hide" : "Show"} Analytics
        </button>

        {(centerNode || highlightIds.length > 0) && (
          <button className="btn btn-secondary" onClick={resetView} style={{ fontSize: "0.75rem" }}>
            <X size={12} /> Reset View
          </button>
        )}
      </div>

      {/* Path finder */}
      <div
        className="card"
        style={{
          marginBottom: "1rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          alignItems: "center",
          padding: "0.6rem 1rem",
        }}
      >
        <Route size={14} style={{ color: "var(--text-secondary)" }} />
        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Path A→B:</span>
        <input
          value={pathSource}
          onChange={(e) => setPathSource(e.target.value)}
          placeholder="Source entity ID"
          style={{ width: 160, fontSize: "0.75rem" }}
        />
        <span style={{ color: "var(--text-secondary)" }}>→</span>
        <input
          value={pathTarget}
          onChange={(e) => setPathTarget(e.target.value)}
          placeholder="Target entity ID"
          style={{ width: 160, fontSize: "0.75rem" }}
        />
        <button className="btn btn-secondary" onClick={handleFindPath} style={{ fontSize: "0.75rem" }}>
          Find Path
        </button>
        {pathResult && (
          <span style={{ fontSize: "0.75rem", color: pathResult.found ? "var(--success)" : "var(--warning)" }}>
            {pathResult.found ? `Path found (${pathResult.hops} hops)` : "No path found"}
          </span>
        )}
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem", padding: "0.75rem" }}>
          <h4 style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Search Results ({searchResults.length})
          </h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {searchResults.map((r) => (
              <button
                key={r.id}
                className="btn btn-secondary"
                style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
                onClick={() => expandFromNode(r.id)}
              >
                <GitBranch size={10} /> {r.label}: {r.value} ({r.connections ?? 0})
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selectedNode || selectedEdge ? "1fr 320px" : "1fr",
          gap: "1rem",
        }}
      >
        <div>
          {loading ? (
            <div className="card" style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 size={24} className="spin" style={{ color: "var(--accent)" }} />
            </div>
          ) : (
            <NetworkGraph
              nodes={
                financialOverlay && financialGraph
                  ? financialGraph.nodes
                  : cdrOverlay && cdrGraph
                    ? cdrGraph.nodes
                    : graph.nodes
              }
              edges={
                financialOverlay && financialGraph
                  ? financialGraph.edges
                  : cdrOverlay && cdrGraph
                    ? cdrGraph.edges
                    : graph.edges
              }
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              height={height}
              highlightNodeIds={highlightIds}
              communityMap={communityMap}
            />
          )}
          <p style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {graph.nodes.length} nodes, {graph.edges.length} relationships
            {centerNode && " • Expanded from selected node"}
          </p>
        </div>

        {selectedNode && (
          <div className="card" style={{ fontSize: "0.85rem" }}>
            <h3 style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Node Details</h3>
            <p><strong>Type:</strong> {selectedNode.label ?? selectedNode.type}</p>
            <p><strong>Value:</strong> {selectedNode.value}</p>
            {selectedNode.confidence != null && (
              <p><strong>Confidence:</strong> {Math.round(selectedNode.confidence * 100)}%</p>
            )}
            {selectedNode.connections != null && (
              <p><strong>Connections:</strong> {selectedNode.connections}</p>
            )}
            {selectedNode.case && (
              <p><strong>Case:</strong> {selectedNode.case.caseNumber}</p>
            )}
            {selectedNode.evidence && (
              <p><strong>Source:</strong> {selectedNode.evidence.fileName}</p>
            )}
            {selectedNode.relationshipTypes && selectedNode.relationshipTypes.length > 0 && (
              <p><strong>Rel Types:</strong> {selectedNode.relationshipTypes.join(", ")}</p>
            )}
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: "0.7rem" }}
                onClick={() => expandFromNode(selectedNode.id)}
              >
                Expand 2-hop
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: "0.7rem" }}
                onClick={() => { setPathSource(selectedNode.id); }}
              >
                Set as Path Source
              </button>
              <button className="btn btn-secondary" style={{ fontSize: "0.7rem" }} onClick={() => setSelectedNode(null)}>
                Close
              </button>
            </div>
          </div>
        )}

        {selectedEdge && (
          <EvidenceProvenanceDrawer
            provenance={selectedEdge}
            caseId={caseId}
            onClose={() => setSelectedEdge(null)}
          />
        )}
      </div>

      {showAnalytics && analytics && (
        <GraphAnalyticsPanel
          caseId={caseId}
          analytics={analytics}
          evolution={evolution}
          onSelectNode={(id) => expandFromNode(id)}
        />
      )}
    </div>
  );
}
