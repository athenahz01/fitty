import { NextResponse } from "next/server";

import { moneyEnabled } from "@/lib/money/server";

export async function GET() {
  return NextResponse.json({ enabled: moneyEnabled() });
}
