import { NextResponse } from "next/server";

import { studentsLikeYouEnabled } from "@/lib/similarity/server";

export async function GET() {
  return NextResponse.json({ enabled: studentsLikeYouEnabled() });
}
