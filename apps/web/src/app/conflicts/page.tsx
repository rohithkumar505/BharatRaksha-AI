"use client";

import { AppShell } from "@/components/SiteHeader";
import { CaseToolPage } from "@/components/CaseToolPage";
import { ConflictsPanel, InvestigationPinboard } from "@/components/WowIntelPanels";

export default function ConflictsPage() {
  return (
    <AppShell>
      <CaseToolPage
        title="Conflict Radar"
        subtitle="Witness / FIR narrative vs digital timeline contradictions (alibi breaker assists)."
      >
        {(caseId) => (
          <>
            <ConflictsPanel caseId={caseId} />
            <InvestigationPinboard caseId={caseId} />
          </>
        )}
      </CaseToolPage>
    </AppShell>
  );
}
