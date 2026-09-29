import { UserRole } from "./db";

export function canAccessCase(
  user: { id: string; role: UserRole; policeStation?: string | null },
  caseData: { investigatingOfficerId: string | null; policeStation: string | null }
): boolean {
  if (user.role === "ADMIN" || user.role === "AUDITOR") return true;
  if (user.role === "SENIOR_OFFICER") {
    if (user.policeStation && caseData.policeStation) {
      return user.policeStation === caseData.policeStation;
    }
    return true;
  }
  if (user.role === "INVESTIGATOR") {
    return caseData.investigatingOfficerId === user.id;
  }
  return false;
}

export function caseAccessFilter(user: {
  id: string;
  role: UserRole;
  policeStation?: string | null;
}) {
  if (user.role === "ADMIN" || user.role === "AUDITOR") return {};
  if (user.role === "SENIOR_OFFICER" && user.policeStation) {
    return { policeStation: user.policeStation };
  }
  if (user.role === "INVESTIGATOR") {
    return { investigatingOfficerId: user.id };
  }
  return { investigatingOfficerId: user.id };
}
