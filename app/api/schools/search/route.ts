import { NextResponse } from "next/server";

import { canadaEnabled } from "@/lib/geo/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Supabase configuration is missing.",
      },
      { status: 500 },
    );
  }

  let builder = supabase
    .from("schools")
    .select(
      "unitid,name,state,province_state,country,selectivity_tier,sat_25,sat_75,act_25,act_75,test_policy",
    )
    .ilike("name", `%${query}%`);

  if (!canadaEnabled()) {
    builder = builder.eq("country", "US");
  }

  const { data, error } = await builder
    .order("name", { ascending: true })
    .limit(8);

  if (error) {
    return NextResponse.json(
      { error: "Unable to search schools." },
      { status: 500 },
    );
  }

  return NextResponse.json({ results: data ?? [] });
}
