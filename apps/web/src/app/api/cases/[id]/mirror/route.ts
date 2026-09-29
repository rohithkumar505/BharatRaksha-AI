import { createCaseIntelHandlers } from "@/lib/case-intel-route";
import { buildMirrorIdentityScoreboard } from "@/lib/mirror-identity";

export const { GET, POST } = createCaseIntelHandlers({
  resource: "mirror",
  get: async (caseId) => buildMirrorIdentityScoreboard(caseId),
  post: async (caseId) => buildMirrorIdentityScoreboard(caseId),
});
