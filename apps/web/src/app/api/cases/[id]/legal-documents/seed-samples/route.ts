import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { loadTestdataFile, registerLegalFile } from "@/lib/register-legal-file";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";
import { z } from "zod";

const bodySchema = z.object({
  files: z.array(z.string()).optional(),
});

const DEFAULT_SAMPLES = ["sample_fir.txt", "sample_surveillance.txt"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("evidence:upload");
  if (error) return error;

  const { id: caseId } = await params;
  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let files = DEFAULT_SAMPLES;
  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (parsed.success && parsed.data.files?.length) files = parsed.data.files;
  } catch {
    /* use defaults */
  }

  const uploaded: Array<{ fileName: string; evidenceId: string; registerNumber: string | null }> = [];
  const errors: string[] = [];

  for (const name of files) {
    try {
      const buffer = await loadTestdataFile(name);
      const mime = name.endsWith(".csv")
        ? "text/csv"
        : name.endsWith(".txt")
          ? "text/plain"
          : "application/octet-stream";
      const { evidence } = await registerLegalFile({
        caseId,
        userId: session!.user.id,
        fileName: name,
        buffer,
        mimeType: mime,
        legalCaption: `Registered from investigation testdata/${name}`,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      });
      uploaded.push({
        fileName: name,
        evidenceId: evidence.id,
        registerNumber: evidence.registerNumber,
      });
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  await logAudit({
    userId: session!.user.id,
    action: "LEGAL_SEED_SAMPLES",
    resource: "case",
    resourceId: caseId,
    details: { uploaded: uploaded.length, errors: errors.length },
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json({
    uploaded,
    errors,
    message:
      uploaded.length > 0
        ? `${uploaded.length} file(s) registered with real SHA-256 + ledger`
        : "No files uploaded — check testdata folder",
  });
}
