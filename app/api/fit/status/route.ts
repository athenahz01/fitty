import { NextResponse } from "next/server";

import { fitFinderEnabled } from "@/lib/fit/server";

export async function GET() {
  return NextResponse.json({ enabled: fitFinderEnabled() });
}
