"use client";

import { AppShell } from "@/components/SiteHeader";
import { CaseToolPage } from "@/components/CaseToolPage";
import { CluesHypothesesPanel } from "@/components/CluesHypothesesPanel";

export default function CluesPage() {
  return (
    <AppShell>
      <CaseToolPage
        title="Clues & Hypotheses"
        subtitle="Evidence-grounded investigative clues and alternate theories (not proof)."
      >
        {(caseId) => <CluesHypothesesPanel caseId={caseId} />}
      </CaseToolPage>
    </AppShell>
  );
}
