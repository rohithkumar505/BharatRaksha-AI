/** Turn API JSON errors (string or Zod flatten) into user-readable text. */
export function parseApiError(payload: unknown, fallback = "Request failed"): string {
  if (!payload || typeof payload !== "object") return fallback;
  const o = payload as Record<string, unknown>;
  if (typeof o.error === "string") return o.error;
  if (o.error && typeof o.error === "object") {
    const flat = o.error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    const parts = [...(flat.formErrors ?? [])];
    for (const [k, v] of Object.entries(flat.fieldErrors ?? {})) {
      parts.push(`${k}: ${(v ?? []).join(", ")}`);
    }
    if (parts.length) return parts.join(" · ");
  }
  if (typeof o.message === "string") return o.message;
  return fallback;
}
