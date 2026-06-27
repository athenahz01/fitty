import { NextResponse } from "next/server";

import { climbEnabled } from "@/lib/climb/server";

export function GET() {
  return NextResponse.json({ enabled: climbEnabled() });
}
