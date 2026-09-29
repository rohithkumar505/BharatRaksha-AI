"use client";

import { AppShell } from "@/components/SiteHeader";
import { FEATURE_DIRECTORY } from "@/lib/nav-config";
import Link from "next/link";

export default function FeaturesPage() {
  const groups = Array.from(new Set(FEATURE_DIRECTORY.map((f) => f.group)));

  return (
    <AppShell>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>SIH26190 feature map</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
          <strong>Single problem statement: SIH26190</strong> — legal &amp; investigation document management (MHA, Smart
          Automation).
        </p>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
          Groups labeled <em>Smart Automation+</em> are optional extensions on the same platform — not a second SIH ID.
          Start at <Link href="/sih26190">SIH26190 Portal</Link> or{" "}
          <Link href="/legal-docs">Legal Document Center</Link>.
        </p>
        {groups.map((group) => (
          <section key={group} style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", color: "var(--saffron)" }}>
              {group}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.75rem" }}>
              {FEATURE_DIRECTORY.filter((f) => f.group === group).map((f) => (
                <Link
                  key={f.href}
                  href={f.href}
                  className="card"
                  style={{ padding: "1rem", display: "block" }}
                >
                  <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>{f.title}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{f.description}</div>
                  {f.needsCase && (
                    <div style={{ fontSize: "0.7rem", color: "var(--accent)", marginTop: "0.5rem" }}>
                      Requires a case
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </AppShell>
  );
}
