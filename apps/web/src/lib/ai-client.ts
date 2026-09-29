import {
  normalizeEntityValue,
  normalizeAmount,
  normalizePhone,
} from "./normalize";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8001";

export interface ExtractedEntity {
  type: string;
  value: string;
  confidence: number;
  start?: number;
  end?: number;
}

export interface NormalizedEntity {
  type: string;
  value: string;
  normalized: string;
  metadata?: Record<string, unknown>;
}

export async function normalizeEntity(
  type: string,
  value: string
): Promise<NormalizedEntity> {
  try {
    const res = await fetch(`${AI_SERVICE_URL}/normalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, value }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        type: data.type,
        value: data.value,
        normalized: data.normalized,
        metadata: data.metadata,
      };
    }
  } catch {
    // Fall through
  }
  return {
    type,
    value,
    normalized: normalizeEntityValue(type, value),
  };
}

export async function extractEntitiesFromText(
  text: string
): Promise<ExtractedEntity[]> {
  try {
    const res = await fetch(`${AI_SERVICE_URL}/extract-entities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const data = await res.json();
      return data.entities ?? [];
    }
  } catch {
    // Fall through to local extraction
  }
  return localExtractEntities(text);
}

export async function ocrDocument(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append("file", blob, "document");
    formData.append("mime_type", mimeType);
    const res = await fetch(`${AI_SERVICE_URL}/ocr`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(120000),
    });
    if (res.ok) {
      const data = await res.json();
      return data.text ?? "";
    }
  } catch {
    // Fall through
  }
  return buffer.toString("utf-8");
}

export async function checkAiServiceHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Local fallback — mirrors Python NER patterns for offline resilience */
export function localExtractEntities(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  function add(type: string, value: string, confidence: number) {
    const key = `${type}:${value.toLowerCase()}`;
    if (!seen.has(key) && value.trim()) {
      seen.add(key);
      entities.push({ type, value: value.trim(), confidence });
    }
  }

  const patterns: Array<{ type: string; regex: RegExp; conf: number; group?: number }> = [
    { type: "PHONE", regex: /(?:\+91[\s-]?)?[6-9]\d{9}|0?[6-9]\d{9}/g, conf: 0.9 },
    { type: "EMAIL", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, conf: 0.95 },
    { type: "UPI", regex: /\b([a-zA-Z0-9._-]+@(?:paytm|ybl|okaxis|okicici|axl|ibl|upi))\b/gi, conf: 0.9 },
    { type: "IFSC", regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, conf: 0.95 },
    { type: "BANK_ACCOUNT", regex: /(?:account|a\/c|acct)[\s.:]*(\d{9,18})/gi, conf: 0.88, group: 1 },
    { type: "VEHICLE", regex: /\b[A-Z]{2}\s?\d{1,2}\s?[A-Z]{1,3}\s?\d{1,4}\b/gi, conf: 0.9 },
    { type: "AMOUNT", regex: /₹\s?[\d,]+(?:\.\d{2})?|\d+(?:\.\d+)?\s*(?:lakh|lac|crore|cr|hazaar|hazar|thousand)/gi, conf: 0.85 },
    { type: "IP_ADDRESS", regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, conf: 0.9 },
    { type: "DOMAIN", regex: /\b(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|in|org|net|gov|co\.in))\b/gi, conf: 0.85, group: 1 },
    { type: "CRYPTO_WALLET", regex: /\b(0x[a-fA-F0-9]{40})\b/g, conf: 0.93 },
    { type: "DEVICE", regex: /\bIMEI[\s:]*(\d{15})\b/gi, conf: 0.94, group: 1 },
    { type: "DATE", regex: /\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b|\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi, conf: 0.88 },
    { type: "CASE_ID", regex: /\b(?:CASE|FIR|CR)[\s/-]*(?:NO\.?|NUMBER)?[\s:]*[A-Z0-9/-]{5,20}\b/gi, conf: 0.8 },
    { type: "SOCIAL_HANDLE", regex: /(?:@|twitter:|instagram:)\s*([a-zA-Z0-9_]{3,30})\b/gi, conf: 0.8, group: 1 },
  ];

  for (const p of patterns) {
    let match;
    while ((match = p.regex.exec(text)) !== null) {
      const val = p.group !== undefined ? match[p.group] : match[0];
      if (p.type === "VEHICLE") add(p.type, val.replace(/\s/g, "").toUpperCase(), p.conf);
      else if (p.type === "SOCIAL_HANDLE") add(p.type, `@${val}`, p.conf);
      else add(p.type, val, p.conf);
    }
  }

  const hinglish = /(\d+(?:\.\d+)?)\s*(?:hazaar|hazar)\b/gi;
  let hm;
  while ((hm = hinglish.exec(text)) !== null) {
    add("AMOUNT", `₹${(parseFloat(hm[1]) * 1000).toLocaleString("en-IN")}`, 0.82);
  }

  const personPatterns = [
    /(?:victim|accused|suspect|complainant|witness|mr\.?|mrs\.?|shri|smt\.?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /(?:accused\s+persons?\s+(?:are|is)\s+)([A-Z][a-z]+(?:\s+(?:and|aur)\s+[A-Z][a-z]+)+)/gi,
  ];
  for (const pattern of personPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const names = match[1].split(/\s+(?:and|aur)\s+/i);
      for (const name of names) {
        if (name.trim().length > 3) add("PERSON", name.trim(), 0.78);
      }
    }
  }

  const cities = ["Bengaluru", "Bangalore", "Mumbai", "Delhi", "Chennai", "Kolkata", "Hyderabad", "Pune", "Koramangala", "MG Road"];
  for (const city of cities) {
    if (text.toLowerCase().includes(city.toLowerCase())) add("LOCATION", city, 0.8);
  }

  const orgPattern = /\b([A-Z][A-Za-z0-9\s&]+(?:Pvt\.?\s*Ltd\.?|Private\s+Limited|Ltd\.?|Bank|Police\s+Station|Cyber\s+Crime\s+Cell)[^,\n]*)/gi;
  let om;
  while ((om = orgPattern.exec(text)) !== null) {
    add("ORGANIZATION", om[1].trim(), 0.82);
  }

  const addrPattern = /(?:address|residence|office\s+at|located\s+at)[\s:]*([A-Za-z0-9\s,.-]{10,80})/gi;
  let am;
  while ((am = addrPattern.exec(text)) !== null) {
    add("ADDRESS", am[1].trim().replace(/,$/, ""), 0.75);
  }

  return entities;
}

export { normalizePhone, normalizeAmount };
