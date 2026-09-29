/** When true, sidebar shows SIH26190 core + court only (real-world demo focus). */
export const SIH26190_CORE_NAV_GROUP_IDS = new Set([
  "sih26190-core",
  "justice",
  "admin",
]);

export const SIH26190_EXTENSION_NAV_GROUP_IDS = new Set([
  "smart-automation",
  "safety-cyber",
  "ai-partner",
]);

const STORAGE_KEY = "br-sih26190-focus-core";

export function isSih26190CoreFocusMode(): boolean {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_SIH26190_FOCUS_CORE !== "false";
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "full") return false;
    if (stored === "core") return true;
  } catch {
    /* ignore */
  }
  return process.env.NEXT_PUBLIC_SIH26190_FOCUS_CORE !== "false";
}

export function setSih26190FocusMode(core: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, core ? "core" : "full");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("sih26190-focus-mode"));
}

export function filterNavGroupsForFocus<T extends { id: string }>(groups: T[]): T[] {
  if (!isSih26190CoreFocusMode()) return groups;
  return groups.filter((g) => SIH26190_CORE_NAV_GROUP_IDS.has(g.id));
}
