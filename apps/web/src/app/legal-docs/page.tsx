"use client";

import { AppShell } from "@/components/SiteHeader";
import { CaseToolPage } from "@/components/CaseToolPage";
import { LegalDocumentCenter } from "@/components/LegalDocumentCenter";
import { LegalInvestigatorGuide } from "@/components/LegalInvestigatorGuide";
import { SIH26190FeatureRegistryPanel } from "@/components/SIH26190FeatureRegistryPanel";
import { SIH26190CapabilityPanel } from "@/components/SIH26190CapabilityPanel";
import { CourtPackPanel, InvestigationPinboard } from "@/components/WowIntelPanels";

export default function LegalDocsPage() {
  return (
    <AppShell>
      <CaseToolPage
        title="Legal Document Management (SIH26190)"
        subtitle="MHA secure digital document management — register, classification, workflow, custody, BSA §63, court bundle."
      >
        {(caseId) => (
          <>
            <LegalInvestigatorGuide caseId={caseId} />
            <SIH26190FeatureRegistryPanel />
            <SIH26190CapabilityPanel />
            <LegalDocumentCenter caseId={caseId} />
            <div style={{ marginTop: "1.5rem" }}>
              <CourtPackPanel caseId={caseId} />
            </div>
            <InvestigationPinboard caseId={caseId} />
          </>
        )}
      </CaseToolPage>
    </AppShell>
  );
}
