"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Download,
  FileCheck,
  Lock,
  RefreshCw,
  Search,
  Shield,
  Upload,
} from "lucide-react";
import {
  CLASSIFICATION_LEVELS,
  LEGAL_DOCUMENT_CATEGORIES,
  LEGAL_DOCUMENT_STATUSES,
} from "@/lib/legal-document-constants";
import { parseApiError } from "@/lib/parse-api-error";
import { LEGAL_UI, type LegalUiLang } from "@/lib/legal-i18n";
import { LegalCaseAutomationPanel } from "@/components/LegalCaseAutomationPanel";
import { LegalVerifiableCustodyTimeline } from "@/components/LegalVerifiableCustodyTimeline";

type LegalDoc = {
  id: string;
  fileName: string;
  registerNumber: string | null;
  exhibitLabel: string | null;
  legalCategory: string;
  documentStatus: string;
  classification: string;
  legalCaption: string | null;
  legalHold: boolean;
  sha256Hash: string;
  documentVersion?: number;
  createdAt: string;
  uploadedBy: { name: string; role: string };
  _count: { custodyLogs: number };
};

type Stats = {
  total: number;
  registered: number;
  underReview: number;
  approved: number;
  sealed: number;
  onLegalHold: number;
};

const STATUS_NEXT: Record<string, string> = {
  REGISTERED: "UNDER_REVIEW",
  UNDER_REVIEW: "APPROVED_FOR_COURT",
  APPROVED_FOR_COURT: "SEALED",
};

export function LegalDocumentCenter({ caseId }: { caseId: string }) {
  const [documents, setDocuments] = useState<LegalDoc[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [verifyResult, setVerifyResult] = useState<string>("");
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<Array<{ id: string; fileName: string; case: { caseNumber: string } }>>(
    []
  );

  const [uploadCategory, setUploadCategory] = useState<string>("INVESTIGATION_RECORD");
  const [uploadClass, setUploadClass] = useState<string>("OFFICIAL");
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [versionParentId, setVersionParentId] = useState<string | null>(null);
  const [workflowNote, setWorkflowNote] = useState("");
  const [detail, setDetail] = useState<{
    document: LegalDoc & {
      legalWorkflowNote?: string | null;
      ocrExcerpt?: string;
      custodyLogs: Array<{ event: string; createdAt: string; user: { name: string } }>;
      childVersions: Array<{ id: string; fileName: string; documentVersion: number }>;
    };
    auditTrail: Array<{ action: string; createdAt: string }>;
  } | null>(null);
  const [qrPreview, setQrPreview] = useState<{
    qrDataUrl: string;
    verifyUrl: string;
    registerNumber: string;
  } | null>(null);
  const [retentionWatch, setRetentionWatch] = useState<
    Array<{ fileName: string; registerNumber: string | null; retentionUntil: string; caseNumber: string }>
  >([]);
  const [lang, setLang] = useState<LegalUiLang>("en");
  const ui = LEGAL_UI[lang];

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (filterCategory) qs.set("category", filterCategory);
      if (filterStatus) qs.set("status", filterStatus);
      const res = await fetch(`/api/cases/${caseId}/legal-documents?${qs.toString()}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Load failed");
      setDocuments(j.documents ?? []);
      setStats(j.stats ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [caseId, filterCategory, filterStatus]);

  useEffect(() => {
    void load();
    fetch("/api/legal-documents/retention-watch?days=60")
      .then((r) => r.json())
      .then((j) => setRetentionWatch(j.items ?? []))
      .catch(() => setRetentionWatch([]));

    const onRefresh = () => void load();
    window.addEventListener("legal-docs-refresh", onRefresh);
    return () => window.removeEventListener("legal-docs-refresh", onRefresh);
  }, [load]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "OTHER");
      fd.append("legalCategory", uploadCategory);
      fd.append("classification", uploadClass);
      if (uploadCaption.trim()) fd.append("legalCaption", uploadCaption.trim());
      if (workflowNote.trim()) fd.append("legalWorkflowNote", workflowNote.trim());
      if (versionParentId) fd.append("parentEvidenceId", versionParentId);
      const res = await fetch(`/api/cases/${caseId}/ingest`, { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed");
      setUploadCaption("");
      setVersionParentId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function transition(evidenceId: string, targetStatus: string) {
    setError("");
    const res = await fetch(`/api/cases/${caseId}/legal-documents`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidenceId, targetStatus }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(parseApiError(j, "Status update failed"));
      return;
    }
    setError("");
    setVerifyResult("Status updated");
    await load();
  }

  async function toggleHold(doc: LegalDoc) {
    const res = await fetch(`/api/cases/${caseId}/legal-documents`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidenceId: doc.id, legalHold: !doc.legalHold }),
    });
    if (!res.ok) {
      const j = await res.json();
      setError(j.error ?? "Legal hold update failed");
      return;
    }
    await load();
  }

  async function verifyBundle() {
    setVerifyResult("");
    const res = await fetch(`/api/cases/${caseId}/legal-documents/verify`, { method: "POST" });
    const j = await res.json();
    if (!res.ok) {
      setError(j.error ?? "Verify failed");
      return;
    }
    setVerifyResult(`${j.passed}/${j.total} documents integrity verified${j.allVerified ? " ✓" : ""}`);
  }

  async function downloadRegisterHtml() {
    setError("");
    const res = await fetch(`/api/cases/${caseId}/legal-documents/register?format=html`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(parseApiError(j, "Register HTML failed"));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `legal-register-${caseId.slice(0, 8)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function openDetail(evidenceId: string) {
    setDetail(null);
    const res = await fetch(`/api/cases/${caseId}/legal-documents/${evidenceId}`);
    const j = await res.json();
    if (res.ok) {
      setDetail(j);
      setWorkflowNote(j.document?.legalWorkflowNote ?? "");
      const ocr = await fetch(`/api/cases/${caseId}/legal-documents/${evidenceId}/ocr-excerpt`);
      const oj = await ocr.json();
      if (ocr.ok && oj.excerpt && j.document) {
        j.document.ocrExcerpt = oj.excerpt;
        setDetail({ ...j });
      }
    }
  }

  async function saveWorkflowNote(evidenceId: string) {
    const res = await fetch(`/api/cases/${caseId}/legal-documents`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidenceId, legalWorkflowNote: workflowNote }),
    });
    if (!res.ok) {
      const j = await res.json();
      setError(j.error ?? "Save failed");
      return;
    }
    await openDetail(evidenceId);
  }

  function publicVerifyUrl(registerNumber: string | null, hash: string) {
    if (!registerNumber) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/verify-document?register=${encodeURIComponent(registerNumber)}&hash=${encodeURIComponent(hash.slice(0, 16))}`;
  }

  async function downloadDisclosure() {
    const res = await fetch(`/api/cases/${caseId}/legal-documents/disclosure-schedule`);
    const j = await res.json();
    if (!res.ok) {
      setError(j.error ?? "Disclosure schedule failed");
      return;
    }
    const blob = new Blob([JSON.stringify(j, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `disclosure-annexure-${j.case?.caseNumber ?? caseId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function certify(evidenceId: string, lane: "IO" | "PROSECUTION") {
    const res = await fetch(`/api/cases/${caseId}/legal-documents/${evidenceId}/certify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lane }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(typeof j.error === "string" ? j.error : "Certify failed");
      return;
    }
    await load();
    if (detail?.document?.id === evidenceId) await openDetail(evidenceId);
  }

  async function showQr(evidenceId: string) {
    const res = await fetch(`/api/cases/${caseId}/legal-documents/${evidenceId}/qr`);
    const j = await res.json();
    if (!res.ok) {
      setError(j.error ?? "QR failed");
      return;
    }
    setQrPreview(j);
  }

  async function forwardDoc(evidenceId: string, toEmail: string) {
    const res = await fetch(`/api/cases/${caseId}/legal-documents/${evidenceId}/forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toEmail, note: "Nazarat forwarding via Legal Document Center" }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(j.error ?? "Forward failed");
      return;
    }
    setError("");
    setVerifyResult(`Forwarded to ${j.toOfficer}`);
    await openDetail(evidenceId);
  }

  async function bulkReview() {
    setError("");
    const res = await fetch(`/api/cases/${caseId}/legal-documents/bulk-review`, { method: "POST" });
    const j = await res.json();
    if (!res.ok) {
      setError(parseApiError(j, "Bulk review failed"));
      return;
    }
    setVerifyResult(`Sent ${j.updated} document(s) to under review`);
    await load();
  }

  async function downloadCompliancePdf() {
    setError("");
    const res = await fetch(`/api/cases/${caseId}/legal-documents/compliance-report`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(parseApiError(j, "Compliance PDF failed"));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-${caseId.slice(0, 8)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadMasterCsv() {
    setError("");
    const res = await fetch(`/api/cases/${caseId}/legal-documents/master-index`);
    if (!res.ok) {
      setError("Master index export failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `master-index-${caseId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadAuditExport() {
    const res = await fetch(`/api/cases/${caseId}/legal-documents/audit-export`);
    const j = await res.json();
    if (!res.ok) {
      setError(parseApiError(j, "Audit export failed"));
      return;
    }
    const blob = new Blob([JSON.stringify(j, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `legal-audit-${caseId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadTemplate(key: string) {
    window.open(`/api/cases/${caseId}/legal-documents/templates?key=${key}`, "_blank");
  }

  async function downloadRegister() {
    const res = await fetch(`/api/cases/${caseId}/legal-documents/register`);
    const j = await res.json();
    if (!res.ok) return;
    const blob = new Blob([JSON.stringify(j, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `legal-register-${j.case?.caseNumber ?? caseId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadBsa(evidenceId: string) {
    const res = await fetch(`/api/cases/${caseId}/legal-documents/bsa/${evidenceId}`);
    const j = await res.json();
    if (!res.ok) {
      setError(j.error ?? "Certificate failed");
      return;
    }
    const blob = new Blob([JSON.stringify(j, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bsa63-${evidenceId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runSearch() {
    if (searchQ.trim().length < 2) return;
    const res = await fetch(`/api/legal-documents/search?q=${encodeURIComponent(searchQ.trim())}`);
    const j = await res.json();
    setSearchHits(j.results ?? []);
  }

  return (
    <div className="card" style={{ padding: "1.25rem" }}>
      <LegalCaseAutomationPanel caseId={caseId} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Shield size={18} style={{ color: "var(--saffron)" }} />
            {ui.title} (SIH26190)
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: 720 }}>
            Secure register, workflow, BSA §63 integrity certificates, and court-ready document bundle — real custody
            ledger, not a mock.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" onClick={() => setLang(lang === "en" ? "hi" : "en")}>
            {lang === "en" ? "हिंदी" : "English"}
          </button>
          <Link href="/legal-command" className="btn btn-secondary">
            MHA Command
          </Link>
          <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => downloadTemplate("fir_outline")}>
            FIR template
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void downloadAuditExport()}>
            Audit export
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void verifyBundle()}>
            <FileCheck size={14} /> {ui.verify}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void bulkReview()}>
            Bulk → review
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void downloadCompliancePdf()}>
            <Download size={14} /> Compliance PDF
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void downloadMasterCsv()}>
            Master CSV
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void downloadDisclosure()}>
            <Download size={14} /> Disclosure annexure
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void downloadRegisterHtml()}>
            <Download size={14} /> Register HTML
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void downloadRegister()}>
            <Download size={14} /> Register JSON
          </button>
        </div>
      </div>

      {stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))",
            gap: "0.5rem",
            marginBottom: "1rem",
          }}
        >
          {[
            ["Total", stats.total],
            ["Registered", stats.registered],
            ["Review", stats.underReview],
            ["Approved", stats.approved],
            ["Sealed", stats.sealed],
            ["Legal hold", stats.onLegalHold],
          ].map(([l, v]) => (
            <div key={String(l)} style={{ background: "var(--bg-secondary)", padding: "0.5rem", borderRadius: 8 }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{l}</div>
              <div style={{ fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {retentionWatch.length > 0 && (
        <p style={{ fontSize: "0.78rem", color: "var(--warning)", marginBottom: "0.75rem" }}>
          Retention watchdog: {retentionWatch.length} document(s) expiring within 60 days across your cases.
        </p>
      )}

      {qrPreview && (
        <div style={{ marginBottom: "1rem", padding: "1rem", border: "1px solid var(--border)", borderRadius: 8, textAlign: "center" }}>
          <p style={{ fontSize: "0.8rem", marginBottom: "0.5rem" }}>Nazarat QR — {qrPreview.registerNumber}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrPreview.qrDataUrl} alt="Verify QR" width={200} height={200} />
          <p style={{ fontSize: "0.65rem", wordBreak: "break-all", marginTop: "0.5rem" }}>{qrPreview.verifyUrl}</p>
          <button type="button" className="btn btn-secondary" style={{ marginTop: "0.5rem" }} onClick={() => setQrPreview(null)}>
            Close QR
          </button>
        </div>
      )}

      {verifyResult && (
        <p style={{ color: "var(--success)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>{verifyResult}</p>
      )}
      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>{error}</p>}

      <div
        style={{
          border: "1px dashed var(--border)",
          borderRadius: 8,
          padding: "1rem",
          marginBottom: "1rem",
        }}
      >
        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.75rem" }}>Register new legal / investigation document</h3>
        <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
          Smart classifier: filenames like <code>sample_fir.txt</code>, <code>witness_statement.pdf</code>, or{" "}
          <code>fsl_report.pdf</code> auto-set legal category at upload.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "end" }}>
          <label style={{ fontSize: "0.75rem" }}>
            Category
            <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} style={{ display: "block", marginTop: 4 }}>
              {LEGAL_DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: "0.75rem" }}>
            Classification
            <select value={uploadClass} onChange={(e) => setUploadClass(e.target.value)} style={{ display: "block", marginTop: 4 }}>
              {CLASSIFICATION_LEVELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1, minWidth: 200, fontSize: "0.75rem" }}>
            Legal caption
            <input
              value={uploadCaption}
              onChange={(e) => setUploadCaption(e.target.value)}
              placeholder="e.g. Witness statement dated 12/03/2026"
              style={{ display: "block", marginTop: 4, width: "100%" }}
            />
          </label>
          <label className="btn btn-primary" style={{ cursor: "pointer" }}>
            <Upload size={14} /> {uploading ? "Uploading…" : ui.upload}
            <input type="file" style={{ display: "none" }} onChange={(e) => void handleUpload(e)} disabled={uploading} />
          </label>
        </div>
        {versionParentId && (
          <p style={{ fontSize: "0.75rem", color: "var(--warning)", marginTop: "0.5rem" }}>
            Uploading new version for document {versionParentId.slice(0, 8)}…
            <button type="button" className="btn btn-secondary" style={{ marginLeft: 8, fontSize: "0.65rem" }} onClick={() => setVersionParentId(null)}>
              Cancel
            </button>
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
        <label style={{ fontSize: "0.75rem" }}>
          Filter category
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ display: "block", marginTop: 4 }}>
            <option value="">All</option>
            {LEGAL_DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: "0.75rem" }}>
          Filter status
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ display: "block", marginTop: 4 }}>
            <option value="">All</option>
            {LEGAL_DOCUMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: 6 }}>
          <Search size={14} /> Cross-case document search
        </h3>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="File name, register #, exhibit, hash prefix…"
            style={{ flex: 1 }}
          />
          <button type="button" className="btn btn-secondary" onClick={() => void runSearch()}>
            Search
          </button>
        </div>
        {searchHits.length > 0 && (
          <ul style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>
            {searchHits.slice(0, 8).map((h) => (
              <li key={h.id}>
                <Link href="/legal-docs">{h.fileName}</Link> · {h.case.caseNumber}
              </li>
            ))}
          </ul>
        )}
      </div>

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading document register…</p>
      ) : documents.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>No documents yet — upload FIR, statements, or exhibits above.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: "0.78rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.4rem" }}>Register #</th>
                <th>File</th>
                <th>Category</th>
                <th>Status</th>
                <th>Exhibit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => {
                const next = STATUS_NEXT[d.documentStatus];
                return (
                  <tr key={d.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.4rem", fontFamily: "monospace" }}>{d.registerNumber ?? "—"}</td>
                    <td>
                      <div>{d.fileName}</div>
                      {d.legalCaption && (
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.7rem" }}>{d.legalCaption}</div>
                      )}
                    </td>
                    <td>{d.legalCategory.replace(/_/g, " ")}</td>
                    <td>{d.documentStatus.replace(/_/g, " ")}</td>
                    <td>{d.exhibitLabel ?? "—"}</td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {next && d.documentStatus !== "SEALED" && d.documentStatus !== "ARCHIVED" && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: "0.65rem", padding: "0.2rem 0.4rem" }}
                            onClick={() => void transition(d.id, next)}
                          >
                            → {next.replace(/_/g, " ")}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: "0.65rem", padding: "0.2rem 0.4rem" }}
                          onClick={() => void toggleHold(d)}
                        >
                          <Lock size={10} /> {d.legalHold ? "Hold on" : "Hold"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: "0.65rem", padding: "0.2rem 0.4rem" }}
                          onClick={() => void openDetail(d.id)}
                        >
                          Detail
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: "0.65rem", padding: "0.2rem 0.4rem" }}
                          onClick={() => setVersionParentId(d.id)}
                        >
                          New version
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: "0.65rem", padding: "0.2rem 0.4rem" }}
                          onClick={() => void certify(d.id, "IO")}
                        >
                          IO certify
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: "0.65rem", padding: "0.2rem 0.4rem" }}
                          onClick={() => void showQr(d.id)}
                        >
                          QR
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: "0.65rem", padding: "0.2rem 0.4rem" }}
                          onClick={() => void downloadBsa(d.id)}
                        >
                          BSA §63
                        </button>
                        <a
                          href={`/api/evidence/${d.id}/download`}
                          className="btn btn-secondary"
                          style={{ fontSize: "0.65rem", padding: "0.2rem 0.4rem" }}
                        >
                          Download
                        </a>
                        <Link href={`/cases/${caseId}`} style={{ fontSize: "0.65rem" }}>
                          Case
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail?.document && (
        <div
          style={{
            marginTop: "1.25rem",
            padding: "1rem",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg-secondary)",
          }}
        >
          <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>Document detail &amp; custody</h3>
          <p style={{ fontSize: "0.8rem" }}>
            {detail.document.fileName} · v{detail.document.documentVersion ?? 1} ·{" "}
            <span style={{ fontFamily: "monospace" }}>{detail.document.sha256Hash.slice(0, 20)}…</span>
          </p>
          {detail.document.registerNumber && (
            <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.35rem" }}>
              Public verify:{" "}
              <code style={{ fontSize: "0.7rem" }}>
                {publicVerifyUrl(detail.document.registerNumber, detail.document.sha256Hash)}
              </code>
            </p>
          )}
          {detail.document.ocrExcerpt && (
            <div style={{ marginTop: "0.75rem", fontSize: "0.72rem", maxHeight: 120, overflow: "auto", background: "var(--bg-primary)", padding: "0.5rem", borderRadius: 6 }}>
              <strong>Smart OCR excerpt</strong>
              <pre style={{ whiteSpace: "pre-wrap", margin: "0.35rem 0 0" }}>{detail.document.ocrExcerpt.slice(0, 1200)}</pre>
            </div>
          )}
          <label style={{ display: "block", fontSize: "0.75rem", marginTop: "0.75rem" }}>
            Workflow note (review / prosecution)
            <textarea
              value={workflowNote}
              onChange={(e) => setWorkflowNote(e.target.value)}
              rows={3}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: "0.5rem" }}
            onClick={() => void saveWorkflowNote(detail.document.id)}
          >
            Save note
          </button>
          {detail.document.custodyLogs?.length > 0 && (
            <ul style={{ marginTop: "0.75rem", fontSize: "0.72rem" }}>
              {detail.document.custodyLogs.slice(0, 8).map((c, i) => (
                <li key={i}>
                  {c.event} — {c.user.name} — {new Date(c.createdAt).toLocaleString("en-IN")}
                </li>
              ))}
            </ul>
          )}
          <LegalVerifiableCustodyTimeline caseId={caseId} evidenceId={detail.document.id} />
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: "0.5rem", marginRight: "0.5rem" }}
            onClick={() => void certify(detail.document.id, "IO")}
          >
            IO certify
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: "0.5rem", marginRight: "0.5rem" }}
            onClick={() => void certify(detail.document.id, "PROSECUTION")}
          >
            Prosecution certify
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: "0.5rem", marginRight: "0.5rem" }}
            onClick={() => void showQr(detail.document.id)}
          >
            Show Nazarat QR
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: "0.5rem" }}
            onClick={() => {
              const email = window.prompt("Forward to officer email (e.g. senior@bharatraksha.gov.in)");
              if (email) void forwardDoc(detail.document.id, email);
            }}
          >
            Nazarat forward
          </button>
          <button type="button" className="btn btn-secondary" style={{ marginTop: "0.5rem", marginLeft: "0.5rem" }} onClick={() => setDetail(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
