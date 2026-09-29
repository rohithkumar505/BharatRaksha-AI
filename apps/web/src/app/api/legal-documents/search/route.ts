import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { searchLegalDocuments } from "@/lib/legal-documents";

export async function GET(request: NextRequest) {
  const { error } = await requireAuth("reports:read");
  if (error) return error;

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 40), 100);
  const results = await searchLegalDocuments(q, limit);
  return NextResponse.json({ query: q, count: results.length, results });
}
