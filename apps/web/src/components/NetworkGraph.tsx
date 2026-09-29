"use client";

import { useEffect, useRef, useCallback } from "react";
import cytoscape, { Core } from "cytoscape";
// @ts-expect-error no types
import coseBilkent from "cytoscape-cose-bilkent";

if (typeof window !== "undefined") {
  cytoscape.use(coseBilkent);
}

export interface GraphNode {
  id: string;
  label: string;
  value: string;
  type?: string;
  confidence?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence?: number;
  evidenceId?: string;
  recordRef?: string;
  approved?: boolean;
  sourceFile?: string;
}

const NODE_COLORS: Record<string, string> = {
  Person: "#3b82f6",
  Phone: "#22c55e",
  BankAccount: "#f59e0b",
  Upi: "#f59e0b",
  Vehicle: "#8b5cf6",
  Location: "#ef4444",
  Email: "#06b6d4",
  Organization: "#ec4899",
  Device: "#a855f7",
  Address: "#f97316",
  Case: "#eab308",
  Entity: "#94a3b8",
};

const COMMUNITY_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#a855f7", "#14b8a6", "#f97316",
];

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (node: GraphNode) => void;
  onEdgeClick?: (edge: GraphEdge) => void;
  height?: number;
  highlightNodeIds?: string[];
  communityMap?: Record<string, number>;
}

export function NetworkGraph({
  nodes,
  edges,
  onNodeClick,
  onEdgeClick,
  height = 500,
  highlightNodeIds = [],
  communityMap = {},
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const onNodeClickRef = useRef(onNodeClick);
  const onEdgeClickRef = useRef(onEdgeClick);
  onNodeClickRef.current = onNodeClick;
  onEdgeClickRef.current = onEdgeClick;

  const highlightSet = new Set(highlightNodeIds);

  useEffect(() => {
    if (!containerRef.current) return;

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements: [
        ...nodes.map((n) => ({
          data: {
            ...n,
            label: (n.value || n.label || "").slice(0, 24),
            type: n.label,
            community: communityMap[n.id],
          },
        })),
        ...edges.map((e) => ({
          data: {
            ...e,
            label: e.type,
          },
        })),
      ],
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "bottom",
            "text-halign": "center",
            "font-size": "10px",
            color: "#f1f5f9",
            "text-margin-y": 4,
            width: (ele: cytoscape.NodeSingular) => (highlightSet.has(ele.data("id")) ? 48 : 36),
            height: (ele: cytoscape.NodeSingular) => (highlightSet.has(ele.data("id")) ? 48 : 36),
            "background-color": (ele: cytoscape.NodeSingular) => {
              const comm = ele.data("community");
              if (comm != null) return COMMUNITY_COLORS[comm % COMMUNITY_COLORS.length];
              return NODE_COLORS[ele.data("type")] ?? "#94a3b8";
            },
            "border-width": (ele: cytoscape.NodeSingular) => (highlightSet.has(ele.data("id")) ? 4 : 2),
            "border-color": (ele: cytoscape.NodeSingular) =>
              highlightSet.has(ele.data("id")) ? "#f59e0b" : "#1e293b",
          },
        },
        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": "#475569",
            "target-arrow-color": "#475569",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": "7px",
            color: "#94a3b8",
            "text-rotation": "autorotate",
          },
        },
        {
          selector: ":selected",
          style: {
            "border-color": "#3b82f6",
            "border-width": 3,
            "line-color": "#3b82f6",
            "target-arrow-color": "#3b82f6",
            width: 3,
          },
        },
      ],
      layout: {
        name: "cose-bilkent",
        animate: true,
        randomize: false,
        nodeDimensionsIncludeLabels: true,
      } as cytoscape.LayoutOptions,
      minZoom: 0.15,
      maxZoom: 4,
      wheelSensitivity: 0.3,
    });

    cy.on("tap", "node", (evt) => {
      const data = evt.target.data() as GraphNode;
      onNodeClickRef.current?.(data);
    });

    cy.on("tap", "edge", (evt) => {
      const data = evt.target.data() as GraphEdge;
      onEdgeClickRef.current?.(data);
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [nodes, edges, highlightNodeIds, communityMap]);

  const fitGraph = useCallback(() => {
    cyRef.current?.fit(undefined, 40);
  }, []);

  if (nodes.length === 0) {
    return (
      <div
        className="card"
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-secondary)",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <p>No network data yet.</p>
        <p style={{ fontSize: "0.8rem" }}>Upload FIR, CDR, or transaction files to build the graph.</p>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn btn-secondary"
        onClick={fitGraph}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 10,
          fontSize: "0.7rem",
          padding: "0.25rem 0.5rem",
        }}
      >
        Fit View
      </button>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--bg-secondary)",
        }}
      />
    </div>
  );
}
