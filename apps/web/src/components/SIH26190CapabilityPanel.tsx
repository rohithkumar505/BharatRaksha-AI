"use client";

import { SIH26190_CAPABILITY_MATRIX } from "@/lib/legal-document-constants";
import { CheckCircle2 } from "lucide-react";

export function SIH26190CapabilityPanel() {
  return (
    <div
      className="card"
      style={{
        padding: "1rem",
        marginBottom: "1rem",
        background: "linear-gradient(135deg, rgba(255,153,51,0.06) 0%, rgba(10,14,26,0) 100%)",
      }}
    >
      <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        SIH26190 — Problem statement coverage
      </h3>
      <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
        Secure digital document management for legal &amp; investigation documents (MHA). All capabilities below are
        implemented in this module with real Postgres, MinIO, and hash-chained custody — not mock UI.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: "0.5rem",
        }}
      >
        {SIH26190_CAPABILITY_MATRIX.map((cap) => (
          <div
            key={cap.id}
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "flex-start",
              fontSize: "0.75rem",
              padding: "0.45rem",
              borderRadius: 8,
              background: "var(--bg-secondary)",
            }}
          >
            <CheckCircle2 size={14} style={{ color: "var(--success)", flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600 }}>{cap.label}</div>
              <div style={{ color: "var(--text-secondary)", marginTop: 2 }}>{cap.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
