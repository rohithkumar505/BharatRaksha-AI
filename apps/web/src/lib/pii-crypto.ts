import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";

function getKey(): Buffer | null {
  const secret = process.env.PII_ENCRYPTION_KEY ?? process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 16) return null;
  return scryptSync(secret, "bharat-raksha-pii-salt", 32);
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptPii(plaintext: string): string {
  if (!plaintext || isEncrypted(plaintext)) return plaintext;
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptPii(stored: string): string {
  if (!stored || !isEncrypted(stored)) return stored;
  const key = getKey();
  if (!key) return "[ENCRYPTED]";

  try {
    const payload = stored.slice(PREFIX.length);
    const [ivB64, tagB64, dataB64] = payload.split(":");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return "[DECRYPT_FAILED]";
  }
}

export function maskPii(value: string, visibleChars = 4): string {
  const plain = decryptPii(value);
  if (plain.length <= visibleChars) return "****";
  return plain.slice(0, visibleChars) + "****" + plain.slice(-2);
}

export function piiEncryptionEnabled(): boolean {
  return getKey() !== null;
}
