"use client";

import { useSession } from "next-auth/react";
import { hasPermission, type AppRole } from "@/lib/roles";

export function usePermissions() {
  const { data: session } = useSession();
  const role = session?.user?.role as AppRole | undefined;

  return {
    role,
    can: (permission: string) => hasPermission(role, permission),
    isAdmin: role === "ADMIN",
    isAuditor: role === "AUDITOR",
  };
}
