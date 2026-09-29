import { createCaseIntelHandlers } from "@/lib/case-intel-route";
import { buildCourtPackManifest } from "@/lib/court-pack";

export const { GET, POST } = createCaseIntelHandlers({
  resource: "court-pack",
  permission: "reports:read",
  get: async (caseId) => buildCourtPackManifest(caseId),
  post: async (caseId) => buildCourtPackManifest(caseId),
});
