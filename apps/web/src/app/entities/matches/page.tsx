"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/SiteHeader";
import Link from "next/link";
import { ExternalLink, CheckCircle, XCircle, Clock } from "lucide-react";
import { extractCasesList, extractArrayList } from "@/lib/api-list";

interface EntityMatch {
  id: string;
  confidence: number;
  status: string;
  reasons: string[];
  reviewedAt?: string;
  reviewedBy?: { name: string };
  entityA: {
    id: string;
    type: string;
    normalizedValue: string;
    caseId: string;
    rawValues: string[];
    evidence?: { id: string; fileName: string; type: string } | null;
  };
  entityB: {
    id: string;
    type: string;
    normalizedValue: string;
    caseId: string;
    rawValues: string[];
    evidence?: { id: string; fileName: string; type: string } | null;
  };
}

interface CaseOption {
  id: string;
  caseNumber: string;
}

export default function EntityMatchesPage() {
  const [matches, setMatches] = useState<EntityMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("PENDING");
  const [caseId, setCaseId] = useState("");
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const loadMatches = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ status });
    if (caseId) params.set("caseId", caseId);
    fetch(`/api/entities/matches?${params}`)
      .then((r) => r.json())
      .then((data) => setMatches(extractArrayList<EntityMatch>(data)))
      .catch(() => setMatches([]))
      .finally(() => setLoading(false));
  }, [status, caseId]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  useEffect(() => {
    fetch("/api/cases?limit=50")
      .then((r) => r.json())
      .then((d) => setCases(extractCasesList<CaseOption>(d)))
      .catch(() => setCases([]));
  }, []);

  async function review(matchId: string, action: "approve" | "reject") {
    setReviewing(matchId);
    await fetch("/api/entities/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, action }),
    });
    setReviewing(null);
    loadMatches();
  }

  const statusTabs = [
    { key: "PENDING", label: "Pending", icon: Clock },
    { key: "APPROVED", label: "Approved", icon: CheckCircle },
    { key: "REJECTED", label: "Rejected", icon: XCircle },
  ];

  return (
    <AppShell>
            <main style={{ maxWidth: 960, margin: "0 auto", padding: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Entity Resolution Review
        </h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
          Human-in-the-loop: approve or reject potential entity matches. AI never auto-merges — investigator decides.
        </p>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              className={`btn ${status === tab.key ? "btn-primary" : "btn-secondary"}`}
              style={{ fontSize: "0.8rem" }}
              onClick={() => setStatus(tab.key)}
            >
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
          <select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            style={{ marginLeft: "auto", fontSize: "0.8rem" }}
          >
            <option value="">All cases</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p style={{ color: "var(--text-secondary)" }}>Loading matches...</p>
        ) : matches.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
            <p style={{ color: "var(--text-secondary)" }}>
              No {status.toLowerCase()} entity matches.
              {status === "PENDING" && " Matches appear when similar entities are detected across evidence."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {matches.map((match) => (
              <div key={match.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span className={`badge ${match.confidence >= 90 ? "badge-low" : "badge-medium"}`}>
                        {Math.round(match.confidence)}% confidence
                      </span>
                      <span className="badge badge-new">{match.entityA.type}</span>
                      {match.status !== "PENDING" && (
                        <span className={`badge ${match.status === "APPROVED" ? "badge-low" : "badge-high"}`}>
                          {match.status}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0.75rem", alignItems: "center", marginTop: "0.5rem" }}>
                      <div style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: 8 }}>
                        <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>{match.entityA.normalizedValue}</p>
                        {match.entityA.rawValues.length > 1 && (
                          <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                            Also: {match.entityA.rawValues.filter((v) => v !== match.entityA.normalizedValue).join(", ")}
                          </p>
                        )}
                        {match.entityA.evidence && (
                          <Link
                            href={`/cases/${match.entityA.caseId}?tab=evidence`}
                            style={{ fontSize: "0.7rem", display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}
                          >
                            <ExternalLink size={12} /> {match.entityA.evidence.fileName}
                          </Link>
                        )}
                      </div>
                      <span style={{ color: "var(--text-secondary)", fontSize: "1.25rem" }}>↔</span>
                      <div style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: 8 }}>
                        <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>{match.entityB.normalizedValue}</p>
                        {match.entityB.rawValues.length > 1 && (
                          <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                            Also: {match.entityB.rawValues.filter((v) => v !== match.entityB.normalizedValue).join(", ")}
                          </p>
                        )}
                        {match.entityB.evidence && (
                          <Link
                            href={`/cases/${match.entityB.caseId}?tab=evidence`}
                            style={{ fontSize: "0.7rem", display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}
                          >
                            <ExternalLink size={12} /> {match.entityB.evidence.fileName}
                          </Link>
                        )}
                      </div>
                    </div>

                    <ul style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "var(--text-secondary)", paddingLeft: "1.25rem" }}>
                      {(match.reasons as string[]).map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>

                    {match.reviewedBy && (
                      <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                        Reviewed by {match.reviewedBy.name}
                        {match.reviewedAt && ` on ${new Date(match.reviewedAt).toLocaleString()}`}
                      </p>
                    )}

                    <p style={{ fontSize: "0.75rem", color: "var(--warning)", marginTop: "0.5rem" }}>
                      Potential match — review recommended, not proof of same entity.
                    </p>
                  </div>

                  {status === "PENDING" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <button
                        className="btn btn-success"
                        disabled={reviewing === match.id}
                        onClick={() => review(match.id, "approve")}
                      >
                        Approve Merge
                      </button>
                      <button
                        className="btn btn-danger"
                        disabled={reviewing === match.id}
                        onClick={() => review(match.id, "reject")}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
