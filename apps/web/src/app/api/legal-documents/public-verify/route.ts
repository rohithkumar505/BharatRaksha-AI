import { NextRequest, NextResponse } from "next/server";
import { publicVerifyByRegister } from "@/lib/legal-documents";
import { rateLimit } from "@/lib/rate-limit";

/** Unauthenticated integrity check — register # + hash prefix only (no file download). */
export async function GET(request: NextRequest) {
  const limited = await rateLimit(request, "legal-public-verify", 30, 60);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const register = searchParams.get("register") ?? "";
  const hashPrefix = searchParams.get("hash") ?? searchParams.get("hashPrefix") ?? "";

  const result = await publicVerifyByRegister(register, hashPrefix);
  if ("error" in result && !result.verified) {
    return NextResponse.json(result, { status: 404 });
  }
  return NextResponse.json(result);
}
