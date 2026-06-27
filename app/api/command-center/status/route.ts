import { NextResponse } from "next/server";

import { commandCenterEnabled } from "@/lib/command-center/server";

export function GET() {
  return NextResponse.json({ enabled: commandCenterEnabled() });
}
