"use client";

import { AppShell } from "@/components/SiteHeader";
import Link from "next/link";
import { SIH26190_FEATURE_REGISTRY } from "@/lib/sih26190-feature-registry";
import { SIH26190CapabilityPanel } from "@/components/SIH26190CapabilityPanel";
import {
  SIH26190_EXTENSION_MODULES,
  SIH26190_PITCH_ONE_LINER,
  SIH26190_PRODUCT,
} from "@/lib/sih26190-product-scope";

export default function Sih26190PortalPage() {
  return (
    <AppShell>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
          {SIH26190_PRODUCT.shortName}
        </h1>
        <p style={{ color: "var(--text-secondary)", maxWidth: 720, lineHeight: 1.5, marginTop: "0.5rem" }}>
          {SIH26190_PRODUCT.title} · {SIH26190_PRODUCT.ministry} · Theme: {SIH26190_PRODUCT.theme}
        </p>
        <p style={{ color: "var(--text-secondary)", maxWidth: 720, lineHeight: 1.5, marginTop: "0.65rem" }}>
          {SIH26190_PITCH_ONE_LINER}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", margin: "1.5rem 0" }}>
          <Link href="/legal-docs" className="btn btn-primary">
            Legal Document Center
          </Link>
          <Link href="/legal-command" className="btn btn-secondary">
            MHA Command Center
          </Link>
          <Link href="/help/sih26190" className="btn btn-secondary">
            Investigator manual
          </Link>
          <Link href="/verify-document" className="btn btn-secondary">
            Public verify
          </Link>
        </div>

        <SIH26190CapabilityPanel />

        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.75rem" }}>
            Core capability registry ({SIH26190_FEATURE_REGISTRY.length})
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "0.5rem",
            }}
          >
            {SIH26190_FEATURE_REGISTRY.map((f) => (
              <Link
                key={f.id}
                href={f.page ?? "/legal-docs"}
                className="card"
                style={{ padding: "0.75rem", display: "block", fontSize: "0.8rem" }}
              >
                <div style={{ fontWeight: 600 }}>{f.label}</div>
                <div style={{ color: "var(--text-secondary)", marginTop: 4, fontSize: "0.72rem" }}>{f.route}</div>
              </Link>
            ))}
          </div>
        </section>

        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Smart Automation+ (optional — same SIH26190)
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
            Extra modules you can demo as value-add: they all use the same case file and feed the legal register.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "0.5rem",
            }}
          >
            {SIH26190_EXTENSION_MODULES.map((m) => (
              <Link key={m.href} href={m.href} className="card" style={{ padding: "0.75rem", display: "block" }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{m.title}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--saffron)", marginTop: 4 }}>{m.pillar}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>{m.blurb}</div>
              </Link>
            ))}
          </div>
          <p style={{ fontSize: "0.8rem", marginTop: "1rem", color: "var(--text-secondary)" }}>
            Full route map: <Link href="/features">Feature map (26190)</Link>
          </p>
        </section>
      </main>
    </AppShell>
  );
}
