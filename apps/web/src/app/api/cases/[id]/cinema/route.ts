import { createCaseIntelHandlers } from "@/lib/case-intel-route";
import { buildStoryCinema } from "@/lib/story-cinema";

export const { GET, POST } = createCaseIntelHandlers({
  resource: "cinema",
  get: async (caseId) => buildStoryCinema(caseId),
  post: async (caseId) => buildStoryCinema(caseId),
});
