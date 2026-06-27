import { NextResponse } from "next/server";

import { commandCenterEnabled } from "@/lib/command-center/server";
import {
  formatValidationError,
  requirementStatusUpdateSchema,
} from "@/lib/command-center/schema";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

async function requireSubjectId(
  request: Request,
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing bearer token.");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new Error("Missing bearer token.");
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Invalid bearer token.");
  }

  return data.user.id;
}

export async function PATCH(request: Request) {
  if (!commandCenterEnabled()) {
    return NextResponse.json(
      { error: "Application Command Center is not enabled." },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = requirementStatusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error) },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
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

  let subjectId: string;
  try {
    subjectId = await requireSubjectId(request, supabase);
  } catch {
    return NextResponse.json(
      { error: "A signed-in owner is required." },
      { status: 401 },
    );
  }

  const row = {
    subject_id: subjectId,
    unitid: parsed.data.unitid,
    program_requirement_id: parsed.data.program_requirement_id ?? null,
    requirement_key: parsed.data.requirement_key,
    status: parsed.data.status,
    source_url: parsed.data.source_url ?? null,
  };

  const { data, error } = await supabase
    .from("requirement_status")
    .upsert(row, { onConflict: "subject_id,unitid,requirement_key" })
    .select("unitid,program_requirement_id,requirement_key,status,source_url")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Unable to update requirement status." },
      { status: 500 },
    );
  }

  return NextResponse.json({ status: data });
}
