export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return digits.length > 0 ? `+${digits}` : raw.trim();
}

export function normalizeAmount(raw: string): { display: string; numeric: number | null } {
  const lower = raw.toLowerCase().trim();
  const croreMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:crore|cr)\b/);
  if (croreMatch) {
    const n = parseFloat(croreMatch[1]) * 10_000_000;
    return { display: `₹${n.toLocaleString("en-IN")}`, numeric: n };
  }
  const lakhMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lac)\b/);
  if (lakhMatch) {
    const n = parseFloat(lakhMatch[1]) * 100_000;
    return { display: `₹${n.toLocaleString("en-IN")}`, numeric: n };
  }
  const thousandMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:hazaar|hazar|thousand|k)\b/);
  if (thousandMatch) {
    const n = parseFloat(thousandMatch[1]) * 1000;
    return { display: `₹${n.toLocaleString("en-IN")}`, numeric: n };
  }
  const numMatch = lower.replace(/[₹,rs.\s]/g, "").match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    const n = parseFloat(numMatch[1]);
    return { display: `₹${n.toLocaleString("en-IN")}`, numeric: n };
  }
  return { display: raw.trim(), numeric: null };
}

export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function normalizeAddress(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDate(raw: string): string {
  const trimmed = raw.trim();
  const dmy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return trimmed;
}

export function normalizeEntityValue(type: string, value: string): string {
  const t = type.toUpperCase();
  switch (t) {
    case "PHONE":
      return normalizePhone(value);
    case "AMOUNT":
      return normalizeAmount(value).display;
    case "PERSON":
      return normalizeName(value);
    case "ADDRESS":
    case "LOCATION":
      return normalizeAddress(value);
    case "DATE":
      return normalizeDate(value);
    case "EMAIL":
    case "UPI":
    case "DOMAIN":
      return value.trim().toLowerCase();
    case "IFSC":
    case "VEHICLE":
      return value.replace(/\s/g, "").toUpperCase();
    case "BANK_ACCOUNT":
      return value.replace(/\D/g, "");
    case "SOCIAL_HANDLE":
      return value.startsWith("@") ? value.toLowerCase() : `@${value.toLowerCase()}`;
    default:
      return value.trim();
  }
}

export function phonesMatch(a: string, b: string): boolean {
  return normalizePhone(a) === normalizePhone(b);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a).toLowerCase();
  const nb = normalizeName(b).toLowerCase();
  if (na === nb) return 1;
  const partsA = na.split(" ");
  const partsB = nb.split(" ");
  const common = partsA.filter((p) => partsB.includes(p) && p.length > 1);
  const tokenScore = common.length / Math.max(partsA.length, partsB.length);
  const maxLen = Math.max(na.length, nb.length);
  const editScore = maxLen > 0 ? 1 - levenshtein(na, nb) / maxLen : 0;
  return Math.max(tokenScore, editScore);
}

export function addressSimilarity(a: string, b: string): number {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (na === nb) return 1;
  const tokensA = na.split(" ").filter((t) => t.length > 2);
  const tokensB = nb.split(" ").filter((t) => t.length > 2);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const common = tokensA.filter((t) => tokensB.includes(t));
  const jaccard = common.length / new Set([...tokensA, ...tokensB]).size;
  const maxLen = Math.max(na.length, nb.length);
  const editScore = maxLen > 0 ? 1 - levenshtein(na, nb) / maxLen : 0;
  return Math.max(jaccard, editScore);
}
