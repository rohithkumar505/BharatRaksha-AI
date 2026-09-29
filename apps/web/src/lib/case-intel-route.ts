import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { auditAccess } from "@/lib/audit-access";

/** Shared GET/POST handler factory for additive case intel APIs. */
export function createCaseIntelHandlers(options: {
  permission?: string;
  resource: string;
  get: (caseId: string, request: NextRequest) => Promise<unknown>;
  post?: (caseId: string, request: NextRequest) => Promise<unknown>;
}) {
  const permission = options.permission ?? "analytics:read";

  async function gate(request: NextRequest, id: string) {
    const { error, session } = await requireAuth(permission);
    if (error) return { error };
    const caseData = await prisma.case.findUnique({ where: { id } });
    if (!caseData) {
      return { error: NextResponse.json({ error: "Case not found" }, { status: 404 }) };
    }
    if (!canAccessCase(session!.user, caseData)) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    await auditAccess(request, {
      userId: session!.user.id,
      action: "READ",
      resource: options.resource,
      resourceId: id,
    });
    return { session, caseData };
  }

  async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const g = await gate(request, id);
    if ("error" in g && g.error) return g.error;
    try {
      const data = await options.get(id, request);
      return NextResponse.json(data);
    } catch (err) {
      console.error(`${options.resource} GET error:`, err);
      return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
    }
  }

  async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const g = await gate(request, id);
    if ("error" in g && g.error) return g.error;
    if (!options.post) {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }
    try {
      const data = await options.post(id, request);
      return NextResponse.json(data);
    } catch (err) {
      console.error(`${options.resource} POST error:`, err);
      return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
    }
  }

  return { GET, POST };
}
