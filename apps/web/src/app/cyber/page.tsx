"use client";

import { AppShell } from "@/components/SiteHeader";
import { CaseToolPage } from "@/components/CaseToolPage";
import { CyberIntelPanel } from "@/components/CyberIntelPanel";

export default function CyberPage() {
  return (
    <AppShell>
      <CaseToolPage
        title="Cyber Crime Center"
        subtitle="Live mule, SIM-swap/OTP timing, phishing, email, device/IP, and crypto hop leads from case evidence."
      >
        {(caseId) => <CyberIntelPanel caseId={caseId} />}
      </CaseToolPage>
    </AppShell>
  );
}
