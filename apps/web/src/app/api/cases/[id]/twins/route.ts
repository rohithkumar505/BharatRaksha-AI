import { createCaseIntelHandlers } from "@/lib/case-intel-route";
import { findSimilarCases, compareCaseTwins } from "@/lib/case-twin";

export const { GET, POST } = createCaseIntelHandlers({
  resource: "twins",
  get: async (caseId, request) => {
    const other = new URL(request.url).searchParams.get("otherId");
    if (other) return compareCaseTwins(caseId, other);
    return { similar: await findSimilarCases(caseId) };
  },
  post: async (caseId, request) => {
    let body: { otherId?: string } = {};
    try { body = await request.json(); } catch { /* empty */ }
    if (body.otherId) return compareCaseTwins(caseId, body.otherId);
    return { similar: await findSimilarCases(caseId) };
  },
});
