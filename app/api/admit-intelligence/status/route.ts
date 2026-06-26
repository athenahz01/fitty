import { NextResponse } from "next/server";

import { admitIntelligenceEnabled } from "@/lib/score/server";

export async function GET() {
  return NextResponse.json({ enabled: admitIntelligenceEnabled() });
}
