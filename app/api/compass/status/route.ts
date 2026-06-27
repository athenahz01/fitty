import { NextResponse } from "next/server";

import { compassEnabled } from "@/lib/compass/server";

export async function GET() {
  return NextResponse.json({ enabled: compassEnabled() });
}
