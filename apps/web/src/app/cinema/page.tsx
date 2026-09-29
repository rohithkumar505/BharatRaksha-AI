"use client";

import { AppShell } from "@/components/SiteHeader";
import { CaseToolPage } from "@/components/CaseToolPage";
import { StoryCinemaPanel, InvestigationPinboard } from "@/components/WowIntelPanels";

export default function CinemaPage() {
  return (
    <AppShell>
      <CaseToolPage
        title="Evidence Story Cinema"
        subtitle="Play the investigation story as ordered beats from live evidence signals."
      >
        {(caseId) => (
          <>
            <StoryCinemaPanel caseId={caseId} />
            <InvestigationPinboard caseId={caseId} />
          </>
        )}
      </CaseToolPage>
    </AppShell>
  );
}
