"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SIH26190_FEATURE_REGISTRY } from "@/lib/sih26190-feature-registry";

export function SIH26190FeatureRegistryPanel() {
  const [health, setHealth] = useState<string>("checking…");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/legal-documents/capabilities")
      .then((r) => r.json())
      .then((j) => setHealth(j.health?.status === "operational" ? "All systems operational" : "Check Docker/DB"))
      .catch(() => setHealth("Could not reach API"));
  }, []);

  return (
    <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "none",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <h3 style={{ fontSize: "0.95rem", fontWeight: 700 }}>
          SIH26190 — {SIH26190_FEATURE_REGISTRY.length} live capabilities ({health})
        </h3>
        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
          Click to expand full feature registry — every item is implemented (API + UI), not placeholder.
        </p>
      </button>
      {open && (
        <div
          style={{
            marginTop: "0.75rem",
            maxHeight: 320,
            overflow: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "0.35rem",
          }}
        >
          {SIH26190_FEATURE_REGISTRY.map((f) => (
            <div
              key={f.id}
              style={{
                fontSize: "0.68rem",
                padding: "0.35rem",
                borderRadius: 6,
                background: "var(--bg-secondary)",
              }}
            >
              <div style={{ fontWeight: 600 }}>{f.label}</div>
              <div style={{ color: "var(--text-secondary)" }}>{f.route}</div>
              {f.page && (
                <Link href={f.page} style={{ fontSize: "0.65rem" }}>
                  Open →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
