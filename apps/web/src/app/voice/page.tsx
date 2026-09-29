"use client";

import { AppShell } from "@/components/SiteHeader";
import { CaseToolPage } from "@/components/CaseToolPage";
import { CopilotPanel } from "@/components/CopilotPanel";

export default function VoicePage() {
  return (
    <AppShell>
      <CaseToolPage
        title="Voice Investigation Partner"
        subtitle="Use the floating mic (bottom-right) to speak, or type action commands / questions below. Tools run only on action phrases; normal Q&A still uses RAG."
      >
        {(caseId) => (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="card" style={{ padding: "1rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>Try saying / typing:</strong>
              <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem" }}>
                <li>autopilot chalao</li>
                <li>cyber analyze karo</li>
                <li>clues do / brief do</li>
                <li>Summarize this case (RAG question — not a tool)</li>
              </ul>
              <p style={{ marginTop: "0.75rem" }}>
                Browser mic needs HTTPS or localhost permission. If mic fails, type in Copilot below.
              </p>
            </div>
            <CopilotPanel caseId={caseId} />
          </div>
        )}
      </CaseToolPage>
    </AppShell>
  );
}
