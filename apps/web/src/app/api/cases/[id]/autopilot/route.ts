import { createCaseIntelHandlers } from "@/lib/case-intel-route";
import { runInvestigationAutopilot } from "@/lib/investigation-autopilot";
import { computeInvestigationHealth } from "@/lib/investigation-health";
import { resolvePlaybook } from "@/lib/crime-playbooks";
import { prisma } from "@/lib/db";

export const { GET, POST } = createCaseIntelHandlers({
  resource: "autopilot",
  get: async (caseId) => {
    const caseRow = await prisma.case.findUnique({
      where: { id: caseId },
      select: { crimeType: true },
    });
    const playbook = resolvePlaybook(caseRow?.crimeType ?? "");
    const health = await computeInvestigationHealth(caseId);
    return { playbook, health };
  },
  post: async (caseId) => runInvestigationAutopilot(caseId),
});
