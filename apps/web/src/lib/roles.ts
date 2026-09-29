/** Client-safe role types — do NOT import @bharat-raksha/database / Prisma in browser code. */
export type AppRole = "ADMIN" | "INVESTIGATOR" | "SENIOR_OFFICER" | "AUDITOR";

export const ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  INVESTIGATOR: [
    "cases:read",
    "cases:create",
    "cases:update",
    "evidence:upload",
    "evidence:read",
    "evidence:transfer",
    "graph:read",
    "entities:read",
    "entities:review",
    "alerts:read",
    "reports:generate",
    "reports:read",
    "copilot:use",
    "analytics:read",
    "cross-case:read",
  ],
  SENIOR_OFFICER: [
    "cases:read",
    "cases:create",
    "cases:update",
    "cases:delete",
    "evidence:upload",
    "evidence:read",
    "evidence:transfer",
    "graph:read",
    "entities:read",
    "entities:review",
    "alerts:read",
    "alerts:manage",
    "reports:generate",
    "reports:read",
    "copilot:use",
    "cross-case:read",
    "analytics:read",
  ],
  ADMIN: [
    "cases:read",
    "cases:create",
    "cases:update",
    "cases:delete",
    "evidence:upload",
    "evidence:read",
    "evidence:transfer",
    "graph:read",
    "entities:read",
    "entities:review",
    "alerts:read",
    "alerts:manage",
    "reports:generate",
    "reports:read",
    "copilot:use",
    "cross-case:read",
    "analytics:read",
    "users:manage",
    "audit:read",
    "system:configure",
  ],
  AUDITOR: ["cases:read", "evidence:read", "audit:read", "reports:read"],
};

export function hasPermission(role: AppRole | string | undefined, permission: string): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role as AppRole];
  return perms?.includes(permission) ?? false;
}

export function requirePermission(role: AppRole | string, permission: string): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Forbidden: missing permission ${permission}`);
  }
}
