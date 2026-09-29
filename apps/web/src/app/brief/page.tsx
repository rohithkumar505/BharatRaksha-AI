"use client";

import { AppShell } from "@/components/SiteHeader";
import { CaseToolPage } from "@/components/CaseToolPage";
import { CaseBriefPanel } from "@/components/Phase6IntelPanels";

export default function BriefPage() {
  return (
    <AppShell>
      <CaseToolPage
        title="AI Case Brief"
        subtitle="EN/HI structured investigation brief from live case data — assistive only."
      >
        {(caseId) => <CaseBriefPanel caseId={caseId} />}
      </CaseToolPage>
    </AppShell>
  );
}
