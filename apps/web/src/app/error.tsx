"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <main style={{ maxWidth: 520, margin: "4rem auto", padding: "1.5rem", textAlign: "center" }}>
      <h1 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: "0.5rem" }}>Page error</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
        This screen hit a data edge-case. Retry or go back to the dashboard.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Retry
        </button>
        <Link href="/dashboard" className="btn btn-secondary">
          Dashboard
        </Link>
      </div>
    </main>
  );
}
