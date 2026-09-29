"use client";

import { AppShell } from "@/components/SiteHeader";
import { CaseToolPage } from "@/components/CaseToolPage";
import { ChargesheetPanel, InvestigationPinboard } from "@/components/WowIntelPanels";

export default function ChargesheetPage() {
  return (
    <AppShell>
      <CaseToolPage
        title="Charge-sheet Assist"
        subtitle="AI-assisted outline with IPC/IT Act hints — officer must review before any filing."
      >
        {(caseId) => (
          <>
            <ChargesheetPanel caseId={caseId} />
            <InvestigationPinboard caseId={caseId} />
          </>
        )}
      </CaseToolPage>
    </AppShell>
  );
}
