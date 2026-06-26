import { NextResponse } from "next/server";

import { listBuilderEnabled } from "@/lib/list-builder/server";

export async function GET() {
  return NextResponse.json({ enabled: listBuilderEnabled() });
}
