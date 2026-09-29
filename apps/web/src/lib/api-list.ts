/** Normalize `/api/cases` response to always return an array. */
export function extractCasesList<T = { id: string }>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as { cases?: unknown }).cases)) {
    return (data as { cases: T[] }).cases;
  }
  return [];
}

/** Normalize list APIs that may return array or `{ items }` / error. */
export function extractArrayList<T>(data: unknown, key?: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && key) {
    const nested = (data as Record<string, unknown>)[key];
    if (Array.isArray(nested)) return nested as T[];
  }
  return [];
}
