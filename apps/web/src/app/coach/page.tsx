"use client";

import { AppShell } from "@/components/SiteHeader";
import { CaseToolPage } from "@/components/CaseToolPage";
import { CoachPanel } from "@/components/CoachPanel";

export default function CoachPage() {
  return (
    <AppShell>
      <CaseToolPage
        title="Investigator Coach"
        subtitle="Why / next step / avoid cards for junior investigators — assistive guidance only."
      >
        {(caseId) => <CoachPanel caseId={caseId} />}
      </CaseToolPage>
    </AppShell>
  );
}
