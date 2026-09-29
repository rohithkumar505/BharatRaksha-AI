"use client";

import { useEffect, useState, useCallback, use } from "react";
import { AppShell } from "@/components/SiteHeader";
import { GraphExplorer } from "@/components/GraphExplorer";
import { IngestionJobTracker } from "@/components/IngestionJobTracker";
import { CaseWorkflowPanel } from "@/components/CaseWorkflowPanel";
import { CaseNotesPanel } from "@/components/CaseNotesPanel";
import { EvidenceCustodyPanel } from "@/components/EvidenceCustodyPanel";
import { CaseEntitiesPanel } from "@/components/CaseEntitiesPanel";
import { CommunicationIntelPanel } from "@/components/CommunicationIntelPanel";
import { FinancialIntelPanel } from "@/components/FinancialIntelPanel";
import { GeoIntelPanel } from "@/components/GeoIntelPanel";
import { ReportPanel } from "@/components/ReportPanel";
import { AutopilotOverviewPanel } from "@/components/AutopilotOverviewPanel";
import { CopilotPanel } from "@/components/CopilotPanel";
import { LegalDocumentCenter } from "@/components/LegalDocumentCenter";
import { CyberIntelPanel } from "@/components/CyberIntelPanel";
import { WomenSafetyPanel } from "@/components/WomenSafetyPanel";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Upload,
  Shield,
  FileText,
} from "lucide-react";

interface CaseDetail {
  id: string;
  caseNumber: string;
  crimeType: string;
  location: string | null;
  priority: string;
  status: string;
  description: string | null;
  evidence: Array<{
    id: string;
    fileName: string;
    type: string;
    ingestionStatus: string;
    sha256Hash: string;
    blockchainTxId: string | null;
    createdAt: string;
    uploadedBy: { name: string };
  }>;
  entities: Array<{
    id: string;
    type: string;
    normalizedValue: string;
    confidence: number;
  }>;
  notes: Array<{ id: string; content: string; author: { name: string }; createdAt: string }>;
  investigatingOfficer?: { id: string; name: string };
  changesSinceLastVisit?: Array<{ field: string; before: number; after: number; delta: number }>;
  _count: {
    evidence: number;
    entities: number;
    cdrRecords: number;
    transactions: number;
    alerts: number;
  };
}

type Tab = "overview" | "evidence" | "legal" | "entities" | "notes" | "network" | "communication" | "timeline" | "financial" | "cyber" | "women_safety" | "copilot" | "reports";

export default function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = useSession();
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [uploadType, setUploadType] = useState("FIR");
  const [uploading, setUploading] = useState(false);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);

  const loadCase = useCallback(() => {
    fetch(`/api/cases/${id}`)
      .then((r) => r.json())
      .then(setCaseData);
  }, [id]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", uploadType);

    const res = await fetch(`/api/cases/${id}/ingest`, {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const { job } = await res.json();
      pollJob(job.id);
    }
    setUploading(false);
    e.target.value = "";
  }

  function pollJob(jobId: string) {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/cases/${id}/ingest/${jobId}`);
      const job = await res.json();
      if (job.status === "COMPLETED" || job.status === "FAILED") {
        clearInterval(interval);
        loadCase();
      }
    }, 2000);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "evidence", label: "Evidence" },
    { key: "legal", label: "Legal Docs (26190)" },
    { key: "entities", label: "Entities" },
    { key: "notes", label: "Notes" },
    { key: "network", label: "Network Graph" },
    { key: "communication", label: "Communication" },
    { key: "timeline", label: "Geo & Timeline" },
    { key: "financial", label: "Financial" },
    { key: "cyber", label: "Cyber" },
    { key: "women_safety", label: "Women Safety" },
    { key: "copilot", label: "AI Copilot" },
    { key: "reports", label: "Reports" },
  ];

  const canAssign = session?.user?.role === "SENIOR_OFFICER" || session?.user?.role === "ADMIN";

  if (!caseData) {
    return (
      <AppShell>
                <main style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
          Loading case...
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
            <main style={{ maxWidth: 1400, margin: "0 auto", padding: "1.5rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <Link href="/cases" style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            ← Back to Cases
          </Link>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "0.5rem" }}>
            <div>
              <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>{caseData.caseNumber}</h1>
              <p style={{ color: "var(--text-secondary)" }}>
                {caseData.crimeType} {caseData.location && `• ${caseData.location}`}
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <span className={`badge badge-${caseData.priority.toLowerCase()}`}>{caseData.priority}</span>
              <span className="badge badge-new">{caseData.status.replace(/_/g, " ")}</span>
            </div>
          </div>
        </div>

        {caseData.changesSinceLastVisit && caseData.changesSinceLastVisit.length > 0 && (
          <div className="card" style={{ marginBottom: "1rem", borderColor: "var(--warning)", background: "rgba(245,158,11,0.08)" }}>
            <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.5rem" }}>What changed since your last visit</h3>
            {caseData.changesSinceLastVisit.map((c) => (
              <p key={c.field} style={{ fontSize: "0.8rem" }}>
                {c.field}: {c.before} → {c.after} ({c.delta > 0 ? "+" : ""}{c.delta})
              </p>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="btn"
              style={{
                background: tab === t.key ? "var(--accent)" : "transparent",
                color: tab === t.key ? "white" : "var(--text-secondary)",
                border: tab === t.key ? "none" : "1px solid var(--border)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem" }}>
            <div>
              <AutopilotOverviewPanel caseId={id} />
              <div className="card" style={{ marginBottom: "1rem" }}>
                <h2 style={{ fontWeight: 600, marginBottom: "1rem" }}>Case Details</h2>
                {caseData.description && <p style={{ marginBottom: "1rem", lineHeight: 1.6 }}>{caseData.description}</p>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", fontSize: "0.875rem" }}>
                  <div><span style={{ color: "var(--text-secondary)" }}>Evidence Files:</span> {caseData._count.evidence}</div>
                  <div><span style={{ color: "var(--text-secondary)" }}>Entities:</span> {caseData._count.entities}</div>
                  <div><span style={{ color: "var(--text-secondary)" }}>CDR Records:</span> {caseData._count.cdrRecords}</div>
                  <div><span style={{ color: "var(--text-secondary)" }}>Transactions:</span> {caseData._count.transactions}</div>
                  <div><span style={{ color: "var(--text-secondary)" }}>Alerts:</span> {caseData._count.alerts}</div>
                  <div><span style={{ color: "var(--text-secondary)" }}>Officer:</span> {caseData.investigatingOfficer?.name ?? "—"}</div>
                </div>
              </div>
              <CaseWorkflowPanel
                caseId={id}
                currentStatus={caseData.status}
                currentPriority={caseData.priority}
                currentOfficerId={caseData.investigatingOfficer?.id ?? null}
                canAssign={canAssign}
                onUpdated={loadCase}
              />
            </div>
            <div>
              <div className="card">
                <h2 style={{ fontWeight: 600, marginBottom: "1rem" }}>Quick Upload</h2>
                <select value={uploadType} onChange={(e) => setUploadType(e.target.value)} style={{ marginBottom: "0.75rem" }}>
                  <option value="FIR">FIR / Document</option>
                  <option value="CDR">CDR (Call Records)</option>
                  <option value="BANK_TXN">Bank Transactions</option>
                  <option value="VEHICLE">Vehicle Records</option>
                  <option value="EMAIL">Email Records</option>
                  <option value="TOWER">Tower/Location Logs</option>
                  <option value="SURVEILLANCE">Surveillance Report</option>
                </select>
                <label className="btn btn-primary" style={{ cursor: "pointer", justifyContent: "center", width: "100%" }}>
                  <Upload size={16} />
                  {uploading ? "Uploading..." : "Upload Evidence"}
                  <input type="file" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
                </label>
              </div>
              <IngestionJobTracker caseId={id} onComplete={loadCase} />
            </div>
          </div>
        )}

        {tab === "entities" && (
          <CaseEntitiesPanel caseId={id} />
        )}

        {tab === "notes" && (
          <CaseNotesPanel caseId={id} notes={caseData.notes} onAdded={loadCase} />
        )}

        {tab === "evidence" && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h2 style={{ fontWeight: 600 }}>Evidence Files</h2>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <select value={uploadType} onChange={(e) => setUploadType(e.target.value)}>
                  <option value="FIR">FIR</option>
                  <option value="CDR">CDR</option>
                  <option value="BANK_TXN">Transactions</option>
                  <option value="VEHICLE">Vehicle</option>
                  <option value="EMAIL">Email</option>
                  <option value="TOWER">Tower</option>
                  <option value="SURVEILLANCE">Surveillance</option>
                </select>
                <label className="btn btn-primary" style={{ cursor: "pointer" }}>
                  <Upload size={16} /> Upload
                  <input type="file" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
                </label>
              </div>
            </div>
            {caseData.evidence.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem" }}>
                No evidence uploaded yet. Upload FIR, CDR, or transaction files to begin.
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>SHA-256</th>
                    <th>Blockchain</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {caseData.evidence.map((ev) => (
                    <tr key={ev.id}>
                      <td><FileText size={14} style={{ display: "inline", marginRight: 4 }} />{ev.fileName}</td>
                      <td>{ev.type}</td>
                      <td>
                        <span className={`badge ${ev.ingestionStatus === "COMPLETED" ? "badge-low" : ev.ingestionStatus === "FAILED" ? "badge-high" : "badge-new"}`}>
                          {ev.ingestionStatus}
                        </span>
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>
                        {ev.sha256Hash ? `${String(ev.sha256Hash).slice(0, 16)}...` : "—"}
                      </td>
                      <td>{ev.blockchainTxId ? "✓ Anchored" : "—"}</td>
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                          onClick={() => setSelectedEvidenceId(selectedEvidenceId === ev.id ? null : ev.id)}
                        >
                          <Shield size={12} /> {selectedEvidenceId === ev.id ? "Hide" : "Custody"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {selectedEvidenceId && caseData.evidence.find((e) => e.id === selectedEvidenceId) && (
              <EvidenceCustodyPanel
                evidenceId={selectedEvidenceId}
                fileName={caseData.evidence.find((e) => e.id === selectedEvidenceId)!.fileName}
                sha256Hash={caseData.evidence.find((e) => e.id === selectedEvidenceId)!.sha256Hash}
                blockHash={caseData.evidence.find((e) => e.id === selectedEvidenceId)!.blockchainTxId}
                canTransfer={["INVESTIGATOR", "SENIOR_OFFICER", "ADMIN"].includes(session?.user?.role ?? "")}
              />
            )}
            <IngestionJobTracker caseId={id} onComplete={loadCase} />
          </div>
        )}

        {tab === "legal" && (
          <div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Full SIH26190 legal register for this case — same module as{" "}
              <Link href={`/legal-docs?caseId=${id}`}>Legal Document Center</Link>.
            </p>
            <LegalDocumentCenter caseId={id} />
          </div>
        )}

        {tab === "network" && (
          <GraphExplorer caseId={id} height={600} />
        )}

        {tab === "communication" && (
          <CommunicationIntelPanel caseId={id} />
        )}

        {tab === "timeline" && (
          <GeoIntelPanel caseId={id} />
        )}

        {tab === "financial" && (
          <FinancialIntelPanel caseId={id} />
        )}

        {tab === "cyber" && <CyberIntelPanel caseId={id} />}

        {tab === "women_safety" && <WomenSafetyPanel caseId={id} />}

        {tab === "copilot" && (
          <CopilotPanel caseId={id} />
        )}

        {tab === "reports" && (
          <ReportPanel caseId={id} />
        )}
      </main>
    </AppShell>
  );
}
