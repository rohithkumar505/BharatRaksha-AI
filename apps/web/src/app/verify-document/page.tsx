"use client";

import { useEffect, useState } from "react";
import { Shield, CheckCircle2, XCircle } from "lucide-react";

export default function VerifyDocumentPage() {
  const [register, setRegister] = useState("");
  const [hash, setHash] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("register") ?? "";
    const h = params.get("hash") ?? "";
    if (r) setRegister(r);
    if (h) setHash(h);
    if (r && h.length >= 8) {
      void runVerify(r, h);
    }
  }, []);

  async function runVerify(reg: string, hashPrefix: string) {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/legal-documents/public-verify?register=${encodeURIComponent(reg)}&hash=${encodeURIComponent(hashPrefix)}`
      );
      const j = await res.json();
      setResult(j);
    } catch {
      setResult({ verified: false, error: "Network error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await runVerify(register.trim(), hash.trim());
  }

  const ok = result?.verified === true;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary, #0a0e1a)",
        padding: "1rem",
      }}
    >
      <div className="card" style={{ maxWidth: 480, width: "100%", padding: "2rem" }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <Shield size={40} style={{ color: "var(--saffron, #ff9933)", margin: "0 auto 0.75rem" }} />
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Document Integrity Verify</h1>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
            SIH26190 — Bharat Raksha AI public Nazarat check (register # + hash prefix)
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <label style={{ fontSize: "0.8rem" }}>
            Register number
            <input value={register} onChange={(e) => setRegister(e.target.value)} required style={{ display: "block", width: "100%", marginTop: 4 }} />
          </label>
          <label style={{ fontSize: "0.8rem" }}>
            SHA-256 prefix (min 8 chars)
            <input value={hash} onChange={(e) => setHash(e.target.value)} required minLength={8} style={{ display: "block", width: "100%", marginTop: 4 }} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Verifying…" : "Verify integrity"}
          </button>
        </form>

        {result && (
          <div
            style={{
              marginTop: "1.25rem",
              padding: "1rem",
              borderRadius: 8,
              background: ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
              border: `1px solid ${ok ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
              {ok ? <CheckCircle2 size={18} color="#22c55e" /> : <XCircle size={18} color="#ef4444" />}
              {ok ? "Integrity verified" : "Verification failed"}
            </div>
            <pre style={{ fontSize: "0.72rem", marginTop: "0.75rem", overflow: "auto", whiteSpace: "pre-wrap" }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
