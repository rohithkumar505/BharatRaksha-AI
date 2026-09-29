"use client";

import { useEffect } from "react";

/** Catches client render crashes so the whole app doesn't white-screen. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0a0e1a",
          color: "#f1f5f9",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: 16 }}>
            A page error was caught. You can retry without leaving the app.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#ff9933",
              color: "#111",
              border: "none",
              borderRadius: 8,
              padding: "0.65rem 1.1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
