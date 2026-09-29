"use client";

import { useCallback, useEffect, useState } from "react";
import { User, Phone, Mail, Building2, MapPin, FileText, Filter } from "lucide-react";

interface EntityRow {
  id: string;
  type: string;
  normalizedValue: string;
  rawValues: string[];
  confidence: number;
  evidence?: { id: string; fileName: string; type: string } | null;
  createdAt: string;
}

interface Props {
  caseId: string;
}

const TYPE_ICONS: Record<string, typeof User> = {
  PERSON: User,
  PHONE: Phone,
  EMAIL: Mail,
  LOCATION: MapPin,
  ADDRESS: MapPin,
  ORGANIZATION: Building2,
};

export function CaseEntitiesPanel({ caseId }: Props) {
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [byType, setByType] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const url = filter
      ? `/api/cases/${caseId}/entities?type=${filter}`
      : `/api/cases/${caseId}/entities`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setEntities(data.entities ?? []);
      setByType(data.byType ?? {});
    }
    setLoading(false);
  }, [caseId, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const types = Object.keys(byType).sort();

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <h2 style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <FileText size={18} /> Extracted Entities
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Filter size={14} style={{ color: "var(--text-secondary)" }} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ fontSize: "0.8rem" }}>
            <option value="">All types ({entities.length})</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t} ({byType[t]})
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading entities from AI pipeline...</p>
      ) : entities.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem", fontSize: "0.875rem" }}>
          No entities extracted yet. Upload FIR, CDR, or other evidence files to begin AI extraction.
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Value</th>
              <th>Confidence</th>
              <th>Source Evidence</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((e) => {
              const Icon = TYPE_ICONS[e.type] ?? FileText;
              return (
                <tr key={e.id}>
                  <td>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem" }}>
                      <Icon size={14} /> {e.type}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500, fontSize: "0.85rem" }}>{e.normalizedValue}</td>
                  <td>
                    <span className={`badge ${e.confidence >= 0.9 ? "badge-low" : e.confidence >= 0.75 ? "badge-medium" : "badge-new"}`}>
                      {Math.round(e.confidence * 100)}%
                    </span>
                  </td>
                  <td style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {e.evidence ? `${e.evidence.type}: ${e.evidence.fileName}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.75rem" }}>
        Entities extracted via OCR + NER pipeline. Potential duplicates appear in Entity Matches for human review.
      </p>
    </div>
  );
}
