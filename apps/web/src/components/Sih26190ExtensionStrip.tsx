"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { SIH26190_PRODUCT } from "@/lib/sih26190-product-scope";

const LAST_CASE_KEY = "br-last-case-id";

export function Sih26190ExtensionStrip({ caseId: caseIdProp }: { caseId?: string }) {
  const [caseId, setCaseId] = useState<string | undefined>(caseIdProp);

  useEffect(() => {
    if (caseIdProp) {
      setCaseId(caseIdProp);
      return;
    }
    try {
      const stored = localStorage.getItem(LAST_CASE_KEY);
      if (stored) setCaseId(stored);
    } catch {
      /* ignore */
    }
  }, [caseIdProp]);
  return (
    <div
      style={{
        background: "linear-gradient(90deg, rgba(255,153,51,0.12), transparent)",
        borderBottom: "1px solid var(--border)",
        padding: "0.5rem 1rem",
        fontSize: "0.78rem",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "0.65rem",
      }}
    >
      <Sparkles size={14} style={{ color: "var(--saffron)", flexShrink: 0 }} />
      <span>
        <strong>{SIH26190_PRODUCT.id} Smart Automation+</strong> — optional module on the same product (outputs feed the
        legal register).
      </span>
      <Link href="/sih26190" className="btn btn-secondary" style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }}>
        Portal
      </Link>
      {caseId ? (
        <Link
          href={`/legal-docs?caseId=${caseId}`}
          className="btn btn-primary"
          style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }}
        >
          Legal register
        </Link>
      ) : (
        <Link href="/legal-docs" className="btn btn-primary" style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }}>
          Legal register
        </Link>
      )}
    </div>
  );
}
