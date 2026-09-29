"use client";

import { useEffect, useState } from "react";

interface IngestionJob {
  id: string;
  status: string;
  progress: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  evidence: { fileName: string; type: string; id: string };
}

interface Props {
  caseId: string;
  onComplete?: () => void;
}

export function IngestionJobTracker({ caseId, onComplete }: Props) {
  const [jobs, setJobs] = useState<IngestionJob[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      const res = await fetch(`/api/cases/${caseId}/ingest`);
      if (!res.ok) return;
      const data = await res.json();
      if (active) setJobs(data);
    }

    load();
    const interval = setInterval(load, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [caseId]);

  useEffect(() => {
    const done = jobs.filter((j) => j.status === "COMPLETED" || j.status === "FAILED");
    const pending = jobs.filter((j) => j.status === "PENDING" || j.status === "PROCESSING");
    if (done.length > 0 && pending.length === 0 && onComplete) {
      onComplete();
    }
  }, [jobs, onComplete]);

  const activeJobs = jobs.filter((j) => j.status === "PENDING" || j.status === "PROCESSING");
  if (jobs.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <h3 style={{ fontWeight: 600, marginBottom: "0.75rem", fontSize: "0.9rem" }}>
        Ingestion Jobs {activeJobs.length > 0 && `(${activeJobs.length} active)`}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {jobs.slice(0, 8).map((job) => (
          <div key={job.id}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
              <span>{job.evidence.fileName} <span style={{ color: "var(--text-secondary)" }}>({job.evidence.type})</span></span>
              <span className={`badge ${job.status === "COMPLETED" ? "badge-low" : job.status === "FAILED" ? "badge-high" : "badge-new"}`}>
                {job.status}
              </span>
            </div>
            <div style={{ height: 6, background: "var(--bg-secondary)", borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${job.progress}%`,
                  background: job.status === "FAILED" ? "var(--danger)" : "var(--accent)",
                  transition: "width 0.3s",
                }}
              />
            </div>
            {job.error && (
              <p style={{ fontSize: "0.75rem", color: "var(--danger)", marginTop: "0.25rem" }}>{job.error}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
