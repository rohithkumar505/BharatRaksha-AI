"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Building2, FileStack, Shield } from "lucide-react";

type Metrics = {
  ministry: string;
  theme: string;
  totals: { documents: number; sealed: number; pendingReview: number; bsaCertified: number };
  byCategory: Array<{ category: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  automation: { tagged: number; withOcr: number; linked: number };
};

export function LegalCommandCenterPanel() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [scanMsg, setScanMsg] = useState("");

  useEffect(() => {
    fetch("/api/legal-documents/command-center")
      .then((r) => r.json())
      .then(setMetrics)
      .catch(() => setMetrics(null));
  }, []);

  async function runRetentionScan() {
    const res = await fetch("/api/legal-documents/command-center", { method: "POST" });
    const j = await res.json();
    setScanMsg(`Retention scan: ${j.alertsCreated ?? 0} new alert(s)`);
  }

  const catData =
    metrics?.byCategory.map((c) => ({
      name: c.category.replace(/_/g, " ").slice(0, 12),
      count: c.count,
    })) ?? [];

  return (
    <div className="card" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <Building2 size={18} style={{ color: "var(--saffron)" }} />
            MHA Legal Command Center
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4 }}>
            SIH26190 · Secure Digital Document Management · Smart Automation analytics (live data)
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" onClick={() => void runRetentionScan()}>
            Smart retention scan
          </button>
          <Link href="/legal-docs" className="btn btn-primary">
            Open register
          </Link>
        </div>
      </div>

      {scanMsg && <p style={{ fontSize: "0.8rem", color: "var(--success)", marginTop: "0.5rem" }}>{scanMsg}</p>}

      {metrics && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
              gap: "0.75rem",
              marginTop: "1rem",
            }}
          >
            {[
              ["Documents", metrics.totals.documents],
              ["Pending review", metrics.totals.pendingReview],
              ["Sealed", metrics.totals.sealed],
              ["BSA certified", metrics.totals.bsaCertified],
              ["OCR indexed", metrics.automation.withOcr],
              ["Linked docs", metrics.automation.linked],
            ].map(([l, v]) => (
              <div key={String(l)} style={{ background: "var(--bg-secondary)", padding: "0.65rem", borderRadius: 8 }}>
                <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>{l}</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>

          {catData.length > 0 && (
            <div style={{ height: 220, marginTop: "1.25rem" }}>
              <h3 style={{ fontSize: "0.85rem", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: 6 }}>
                <FileStack size={14} /> Documents by legal category
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={catData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--saffron, #ff9933)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <p
            style={{
              fontSize: "0.72rem",
              color: "var(--text-secondary)",
              marginTop: "0.75rem",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Shield size={12} /> Ministry: {metrics.ministry} · Theme: {metrics.theme}
          </p>
        </>
      )}
    </div>
  );
}
