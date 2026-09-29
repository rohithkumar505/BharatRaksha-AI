import { createCaseIntelHandlers } from "@/lib/case-intel-route";
import { analyzeWomenSafety, createWomenSafetyAlerts } from "@/lib/women-safety-intel";

export const { GET, POST } = createCaseIntelHandlers({
  resource: "women-safety",
  get: async (caseId) => analyzeWomenSafety(caseId),
  post: async (caseId) => {
    const alertsCreated = await createWomenSafetyAlerts(caseId);
    const analysis = await analyzeWomenSafety(caseId);
    return { alertsCreated, analysis };
  },
});
