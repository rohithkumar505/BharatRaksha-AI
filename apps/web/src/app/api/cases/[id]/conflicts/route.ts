import { createCaseIntelHandlers } from "@/lib/case-intel-route";
import { analyzeEvidenceConflicts, createConflictAlerts } from "@/lib/conflict-radar";

export const { GET, POST } = createCaseIntelHandlers({
  resource: "conflicts",
  get: async (caseId) => analyzeEvidenceConflicts(caseId),
  post: async (caseId) => {
    const alertsCreated = await createConflictAlerts(caseId);
    const conflicts = await analyzeEvidenceConflicts(caseId);
    return { alertsCreated, conflicts };
  },
});
