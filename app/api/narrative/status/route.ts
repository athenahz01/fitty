import { NextResponse } from "next/server";

import { narrativeConfigured, narrativeEnabled } from "@/lib/narrative/server";

export async function GET() {
  return NextResponse.json({
    enabled: narrativeEnabled(),
    configured: narrativeEnabled() ? narrativeConfigured() : false,
  });
}
