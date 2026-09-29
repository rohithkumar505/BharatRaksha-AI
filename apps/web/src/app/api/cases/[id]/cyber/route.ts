import { createCaseIntelHandlers } from "@/lib/case-intel-route";
import { analyzeCyberIntel, createCyberAlerts } from "@/lib/cyber-intelligence";

export const { GET, POST } = createCaseIntelHandlers({
  resource: "cyber",
  get: async (caseId) => analyzeCyberIntel(caseId),
  post: async (caseId) => {
    const alerts = await createCyberAlerts(caseId);
    const analysis = await analyzeCyberIntel(caseId);
    return { alertsCreated: alerts, analysis };
  },
});
