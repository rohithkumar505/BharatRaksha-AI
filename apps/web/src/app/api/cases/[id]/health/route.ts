import { createCaseIntelHandlers } from "@/lib/case-intel-route";
import { computeInvestigationHealth } from "@/lib/investigation-health";

export const { GET, POST } = createCaseIntelHandlers({
  resource: "health",
  get: async (caseId) => computeInvestigationHealth(caseId),
  post: async (caseId) => computeInvestigationHealth(caseId),
});
