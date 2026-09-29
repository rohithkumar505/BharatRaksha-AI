"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { extractCasesList } from "@/lib/api-list";

export interface CaseOption {
  id: string;
  caseNumber: string;
  crimeType: string;
}

const LAST_CASE_KEY = "br-last-case-id";

/** Shared case picker for hub pages — real /api/cases data only. */
export function CaseToolPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: (caseId: string, cases: CaseOption[]) => React.ReactNode;
}) {
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/cases?limit=50")
      .then((r) => r.json())
      .then((data) => {
        const list = extractCasesList<CaseOption>(data);
        setCases(list);
        if (list.length === 0) return;
        const fromUrl =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("caseId")
            : null;
        const fromMemory =
          typeof window !== "undefined" ? localStorage.getItem(LAST_CASE_KEY) : null;
        const preferred =
          (fromUrl && list.some((c) => c.id === fromUrl) && fromUrl) ||
          (fromMemory && list.some((c) => c.id === fromMemory) && fromMemory) ||
          list[0].id;
        setSelected(preferred);
      })
      .catch(() => setError("Could not load cases"))
      .finally(() => setLoading(false));
  }, []);

  function onSelect(id: string) {
    setSelected(id);
    try {
      localStorage.setItem(LAST_CASE_KEY, id);
    } catch {
      /* ignore */
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.35rem", letterSpacing: "-0.02em" }}>
          {title}
        </h1>
        <p style={{ color: "var(--text-secondary)", maxWidth: 720, lineHeight: 1.45 }}>{subtitle}</p>
      </div>

      {loading && (
        <div className="card" style={{ padding: "1rem" }}>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>Loading cases…</p>
        </div>
      )}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {!loading && cases.length === 0 && (
        <div className="card" style={{ padding: "1.5rem" }}>
          <p style={{ marginBottom: "1rem", color: "var(--text-secondary)" }}>
            No cases yet. Create a case and upload evidence to use this tool.
          </p>
          <Link href="/cases" className="btn btn-primary">
            Go to Cases
          </Link>
        </div>
      )}

      {cases.length > 0 && (
        <>
          <div
            className="card"
            style={{
              padding: "0.85rem 1rem",
              marginBottom: "1.25rem",
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>Active case</label>
            <select
              value={selected}
              onChange={(e) => onSelect(e.target.value)}
              style={{ maxWidth: 420 }}
              aria-label="Select case"
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.caseNumber} — {c.crimeType}
                </option>
              ))}
            </select>
            {selected && (
              <Link href={`/cases/${selected}`} className="btn btn-secondary" style={{ fontSize: "0.8rem" }}>
                Open case workspace
              </Link>
            )}
          </div>
          {selected && children(selected, cases)}
        </>
      )}
    </main>
  );
}
