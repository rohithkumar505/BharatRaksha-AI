import { createCaseIntelHandlers } from "@/lib/case-intel-route";
import { detectPostCrimeSilence } from "@/lib/silence-detector";

export const { GET, POST } = createCaseIntelHandlers({
  resource: "silence",
  get: async (caseId) => detectPostCrimeSilence(caseId),
  post: async (caseId) => detectPostCrimeSilence(caseId),
});
