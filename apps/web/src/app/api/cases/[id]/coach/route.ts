import { createCaseIntelHandlers } from "@/lib/case-intel-route";
import { getInvestigatorCoach } from "@/lib/investigator-coach";

export const { GET, POST } = createCaseIntelHandlers({
  resource: "coach",
  permission: "copilot:use",
  get: async (caseId) => getInvestigatorCoach(caseId),
  post: async (caseId) => getInvestigatorCoach(caseId),
});
