import { createCaseIntelHandlers } from "@/lib/case-intel-route";
import { getCluesAndHypotheses } from "@/lib/clue-hypothesis";

export const { GET, POST } = createCaseIntelHandlers({
  resource: "clues",
  permission: "copilot:use",
  get: async (caseId) => getCluesAndHypotheses(caseId),
  post: async (caseId) => getCluesAndHypotheses(caseId),
});
