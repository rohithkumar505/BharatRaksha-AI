"use client";

import { AppShell } from "@/components/SiteHeader";
import { LegalCommandCenterPanel } from "@/components/LegalCommandCenterPanel";
import { LegalAutomationHubPanel } from "@/components/LegalAutomationHubPanel";
import { SIH26190FeatureRegistryPanel } from "@/components/SIH26190FeatureRegistryPanel";
import Link from "next/link";

export default function LegalCommandPage() {
  return (
    <AppShell>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.35rem" }}>
          MHA · Secure Digital Document Management
        </h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem", maxWidth: 720 }}>
          SIH26190 Smart Automation command view — organisation-wide legal document metrics, retention compliance
          scanning, and links to investigator tools.
        </p>
        <LegalCommandCenterPanel />
        <LegalAutomationHubPanel />
        <SIH26190FeatureRegistryPanel />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "1rem" }}>
          <Link href="/sih26190" className="btn btn-secondary">
            SIH26190 Portal
          </Link>
          <Link href="/legal-docs" className="btn btn-primary">
            Legal Document Center
          </Link>
          <Link href="/help/sih26190" className="btn btn-secondary">
            IO Guide
          </Link>
        </div>
      </main>
    </AppShell>
  );
}
