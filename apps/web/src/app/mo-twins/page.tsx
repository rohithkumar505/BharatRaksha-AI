"use client";

import { AppShell } from "@/components/SiteHeader";
import { CaseToolPage } from "@/components/CaseToolPage";
import { MoTwinPanel } from "@/components/Phase6IntelPanels";

export default function MoTwinsPage() {
  return (
    <AppShell>
      <CaseToolPage
        title="MO Twin Matcher"
        subtitle="Modus operandi fingerprint and similar-case linkage leads from live evidence patterns."
      >
        {(caseId) => <MoTwinPanel caseId={caseId} />}
      </CaseToolPage>
    </AppShell>
  );
}
