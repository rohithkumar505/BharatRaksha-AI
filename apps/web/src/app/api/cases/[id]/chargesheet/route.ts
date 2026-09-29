import { createCaseIntelHandlers } from "@/lib/case-intel-route";
import { buildChargesheetOutline } from "@/lib/chargesheet-assist";

export const { GET, POST } = createCaseIntelHandlers({
  resource: "chargesheet",
  permission: "reports:read",
  get: async (caseId) => buildChargesheetOutline(caseId),
  post: async (caseId) => buildChargesheetOutline(caseId),
});
