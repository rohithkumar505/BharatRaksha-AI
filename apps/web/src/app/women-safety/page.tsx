"use client";

import { AppShell } from "@/components/SiteHeader";
import { CaseToolPage } from "@/components/CaseToolPage";
import { WomenSafetyPanel } from "@/components/WomenSafetyPanel";

export default function WomenSafetyPage() {
  return (
    <AppShell>
      <CaseToolPage
        title="Women Safety Center"
        subtitle="Stalking, escalation, proximity, trafficking indicators, and narrative threat keywords — assistive leads only."
      >
        {(caseId) => <WomenSafetyPanel caseId={caseId} />}
      </CaseToolPage>
    </AppShell>
  );
}
