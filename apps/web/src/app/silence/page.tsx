"use client";

import { AppShell } from "@/components/SiteHeader";
import { CaseToolPage } from "@/components/CaseToolPage";
import { SilenceDetectorPanel, InvestigationPinboard } from "@/components/WowIntelPanels";

export default function SilencePage() {
  return (
    <AppShell>
      <CaseToolPage
        title="Silence Detector"
        subtitle="Who went quiet after the crime window — post-crime silence leads from CDR/transactions."
      >
        {(caseId) => (
          <>
            <SilenceDetectorPanel caseId={caseId} />
            <InvestigationPinboard caseId={caseId} />
          </>
        )}
      </CaseToolPage>
    </AppShell>
  );
}
