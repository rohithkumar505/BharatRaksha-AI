const MAGIC_SIGNATURES: Array<{ mime: string; bytes: number[] }> = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
];

const TEXT_EXTENSIONS = new Set(["txt", "csv"]);

export interface FileScanResult {
  safe: boolean;
  reason?: string;
  detectedMime?: string;
}

export function scanFileBuffer(
  buffer: Buffer,
  fileName: string,
  declaredMime?: string
): FileScanResult {
  if (buffer.length === 0) {
    return { safe: false, reason: "Empty file" };
  }

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (TEXT_EXTENSIONS.has(ext)) {
    const sample = buffer.slice(0, 512).toString("utf-8");
    const nullBytes = sample.includes("\0");
    if (nullBytes) return { safe: false, reason: "Binary content in text file" };
    return { safe: true, detectedMime: ext === "csv" ? "text/csv" : "text/plain" };
  }

  for (const sig of MAGIC_SIGNATURES) {
    if (sig.bytes.every((b, i) => buffer[i] === b)) {
      if (declaredMime && !declaredMime.includes(sig.mime.split("/")[1])) {
        const allowed =
          (sig.mime === "image/jpeg" && declaredMime === "image/jpg") ||
          declaredMime === sig.mime ||
          declaredMime === "application/octet-stream";
        if (!allowed) {
          return { safe: false, reason: `MIME mismatch: declared ${declaredMime}, detected ${sig.mime}` };
        }
      }
      return { safe: true, detectedMime: sig.mime };
    }
  }

  if (ext === "docx" || ext === "doc") {
    return { safe: true, detectedMime: declaredMime };
  }

  if (declaredMime === "text/plain" || declaredMime === "text/csv") {
    return { safe: true, detectedMime: declaredMime };
  }

  return { safe: false, reason: "Unrecognized file format — upload blocked for security" };
}

export const DANGEROUS_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "sh", "ps1", "msi", "dll", "scr", "vbs", "js", "jar", "apk",
]);

export function isDangerousExtension(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return DANGEROUS_EXTENSIONS.has(ext);
}
