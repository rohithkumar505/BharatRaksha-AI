import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import {
  LEGAL_AUTOMATION_PLAYBOOKS,
  listRecentAutomationRuns,
} from "@/lib/legal-automation-engine";

export async function GET() {
  const { error } = await requireAuth("cases:read");
  if (error) return error;

  const recentRuns = await listRecentAutomationRuns(12);
  return NextResponse.json({
    psAlignment: "SIH26190",
    theme: "Smart Automation",
    playbooks: LEGAL_AUTOMATION_PLAYBOOKS,
    recentRuns,
  });
}
