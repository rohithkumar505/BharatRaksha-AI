"use client";

import { AppShell } from "@/components/SiteHeader";
import { CaseToolPage } from "@/components/CaseToolPage";
import { CaseTwinsPanel, InvestigationPinboard } from "@/components/WowIntelPanels";

export default function TwinsPage() {
  return (
    <AppShell>
      <CaseToolPage
        title="Case Twin Compare"
        subtitle="Find similar cases and compare entity/MO overlap side-by-side."
      >
        {(caseId) => (
          <>
            <CaseTwinsPanel caseId={caseId} />
            <InvestigationPinboard caseId={caseId} />
          </>
        )}
      </CaseToolPage>
    </AppShell>
  );
}
