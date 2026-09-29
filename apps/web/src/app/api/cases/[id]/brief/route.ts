import { createCaseIntelHandlers } from "@/lib/case-intel-route";
import { generateCaseBrief } from "@/lib/case-brief";

export const { GET, POST } = createCaseIntelHandlers({
  resource: "brief",
  permission: "copilot:use",
  get: async (caseId) => generateCaseBrief(caseId),
  post: async (caseId) => generateCaseBrief(caseId),
});
