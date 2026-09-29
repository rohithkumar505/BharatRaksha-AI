import { prisma } from "./db";
import { canAccessCase } from "./case-access";
import { UserRole } from "./db";

export async function getEvidenceForUser(
  evidenceId: string,
  user: { id: string; role: UserRole; policeStation?: string | null }
) {
  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    include: {
      case: {
        select: {
          id: true,
          caseNumber: true,
          investigatingOfficerId: true,
          policeStation: true,
        },
      },
      uploadedBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!evidence) return { evidence: null, forbidden: false };
  if (!canAccessCase(user, evidence.case)) {
    return { evidence: null, forbidden: true };
  }

  return { evidence, forbidden: false };
}
