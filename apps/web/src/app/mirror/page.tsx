"use client";

import { AppShell } from "@/components/SiteHeader";
import { CaseToolPage } from "@/components/CaseToolPage";
import { MirrorIdentityPanel, InvestigationPinboard } from "@/components/WowIntelPanels";

export default function MirrorPage() {
  return (
    <AppShell>
      <CaseToolPage
        title="Mirror Identity"
        subtitle="Fusion scoreboard of person masks across phone, UPI, vehicle, IP, device, bank, email."
      >
        {(caseId) => (
          <>
            <MirrorIdentityPanel caseId={caseId} />
            <InvestigationPinboard caseId={caseId} />
          </>
        )}
      </CaseToolPage>
    </AppShell>
  );
}
