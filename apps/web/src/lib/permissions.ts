/** @deprecated Prefer `@/lib/roles` — kept for server imports that expect this path. */
export {
  type AppRole as UserRole,
  ROLE_PERMISSIONS,
  hasPermission,
  requirePermission,
} from "./roles";
