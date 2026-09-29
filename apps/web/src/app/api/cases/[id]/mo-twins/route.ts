import { createCaseIntelHandlers } from "@/lib/case-intel-route";
import { findMoTwins } from "@/lib/mo-twin";

export const { GET, POST } = createCaseIntelHandlers({
  resource: "mo-twins",
  get: async (caseId) => findMoTwins(caseId),
  post: async (caseId) => findMoTwins(caseId),
});
