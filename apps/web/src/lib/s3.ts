import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { createHash } from "crypto";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.S3_BUCKET ?? "evidence";

export function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function uploadEvidenceFile(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<{ path: string; sha256: string }> {
  const sha256 = computeSha256(buffer);

  const putParams: {
    Bucket: string;
    Key: string;
    Body: Buffer;
    ContentType: string;
    Metadata: { sha256: string };
    ServerSideEncryption?: "AES256";
  } = {
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    Metadata: { sha256 },
  };

  if (process.env.S3_SSE === "true") {
    putParams.ServerSideEncryption = "AES256";
  }

  await s3.send(new PutObjectCommand(putParams));

  return { path: key, sha256 };
}

export async function downloadEvidenceFile(key: string): Promise<Buffer> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );
  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) throw new Error("Empty file response");
  return Buffer.from(bytes);
}

export async function verifyFileIntegrity(
  key: string,
  expectedHash: string
): Promise<{ verified: boolean; currentHash: string }> {
  const buffer = await downloadEvidenceFile(key);
  const currentHash = computeSha256(buffer);
  return { verified: currentHash === expectedHash, currentHash };
}

export async function fileExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}
