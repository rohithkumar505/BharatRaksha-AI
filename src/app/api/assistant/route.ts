import { NextResponse } from "next/server";

function buildReply(message: string) {
  const q = message.toLowerCase();

  if (q.includes("flood") || q.includes("risk") || q.includes("cyclone")) {
    return "Risk outlook is elevated in the selected region. Monitor rainfall updates, move away from low-lying areas, and use Live Map for safe zones and shelters.";
  }
  if (q.includes("route") || q.includes("evacuat") || q.includes("map")) {
    return "Use Live Map safe-route guidance. Avoid blocked/flooded roads and keep an alternate evacuation path ready.";
  }
  if (q.includes("shelter")) {
    return "Nearest demo shelters are listed on Live Map with distance and occupancy. Prefer verified camps with open capacity.";
  }
  if (q.includes("hospital") || q.includes("first aid") || q.includes("blood") || q.includes("medicine")) {
    return "Healthcare support module can guide first aid, nearby hospitals, ambulance coordination, blood banks, and medicine availability.";
  }
  if (q.includes("crop") || q.includes("farm") || q.includes("livestock") || q.includes("insurance")) {
    return "Agriculture recovery can assess crop damage from images, estimate farm flood impact, and guide insurance/compensation steps.";
  }
  if (q.includes("scheme") || q.includes("relief") || q.includes("compensation")) {
    return "I can help explain disaster relief scheme eligibility, documents needed, and application guidance for your state and disaster type.";
  }

  return "I can help with disaster prediction, maps, shelters, hospitals, first aid, crop recovery, government schemes, and rescue coordination. Tell me what you need.";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { message?: string };
  const message = body.message?.trim() || "";

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  // Later: connect Gemini/OpenAI here using server env keys.
  return NextResponse.json({
    reply: buildReply(message),
    source: "bharatraksha-rules-engine",
  });
}
