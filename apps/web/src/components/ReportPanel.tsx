"use client";

import { useEffect, useState } from "react";
import { FileText, Download, Loader2, RefreshCw } from "lucide-react";

interface Report {
  id: string;
  title: string;
  createdAt: string;
  createdBy: { name: string };
}

interface Props {
  caseId: string;
}

export function ReportPanel({ caseId }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  function load() {
    setLoading(true);
    fetch(`/api/cases/${caseId}/reports`)
      .then((r) => r.json())
      .then((d) => setReports(d.reports ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [caseId]);

  async function generateReport() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/reports`, { method: "POST" });
      if (res.ok) load();
    } finally {
      setGenerating(false);
    }
  }

  function downloadReport(reportId: string) {
    window.open(`/api/cases/${caseId}/reports/${reportId}/download`, "_blank");
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <FileText size={18} /> Investigation Reports
        </h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn" onClick={load} disabled={loading}>
            <RefreshCw size={14} />
          </button>
          <button className="btn btn-primary" onClick={generateReport} disabled={generating}>
            {generating ? <Loader2 size={14} className="spin" /> : <FileText size={14} />}
            Generate PDF Report
          </button>
        </div>
      </div>

      <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
        Full investigation report: summary, network analysis, timeline, financial AML, communication intel, key relationships, leads, and evidence sources with SHA-256 hashes.
      </p>

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading reports...</p>
      ) : reports.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem" }}>
          No reports generated yet. Click &quot;Generate PDF Report&quot; to create one.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {reports.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.75rem",
                background: "var(--bg-secondary)",
                borderRadius: 8,
              }}
            >
              <div>
                <p style={{ fontWeight: 500, fontSize: "0.875rem" }}>{r.title}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  {new Date(r.createdAt).toLocaleString("en-IN")} — {r.createdBy.name}
                </p>
              </div>
              <button className="btn btn-secondary" onClick={() => downloadReport(r.id)}>
                <Download size={14} /> PDF
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
