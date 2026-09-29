"use client";

import { AppShell } from "@/components/SiteHeader";
import { CaseToolPage } from "@/components/CaseToolPage";
import { CourtPackPanel, InvestigationPinboard } from "@/components/WowIntelPanels";

export default function CourtPage() {
  return (
    <AppShell>
      <CaseToolPage
        title="Reports & Court Pack"
        subtitle="Court-ready manifest: reports, evidence hashes, alerts — download JSON bundle metadata."
      >
        {(caseId) => (
          <>
            <CourtPackPanel caseId={caseId} />
            <InvestigationPinboard caseId={caseId} />
          </>
        )}
      </CaseToolPage>
    </AppShell>
  );
}
