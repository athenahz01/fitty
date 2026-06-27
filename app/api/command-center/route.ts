import { NextResponse } from "next/server";

import {
  assembleCommandCenter,
  type CommandCenterDeadline,
  type CommandCenterDocument,
  type CommandCenterProgramRequirement,
  type CommandCenterRequirementStatus,
  type CommandCenterSchool,
} from "@/lib/command-center";
import { commandCenterEnabled } from "@/lib/command-center/server";
import {
  commandCenterRequestSchema,
  formatValidationError,
} from "@/lib/command-center/schema";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

async function subjectIdFromBearer(
  request: Request,
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return null;
  }

  if (!authorization.startsWith("Bearer ")) {
    throw new Error("Invalid bearer token.");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new Error("Invalid bearer token.");
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Invalid bearer token.");
  }

  return data.user.id;
}

export async function POST(request: Request) {
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

  const parsed = commandCenterRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error) },
      { status: 400 },
    );
  }

  const unitids = [...new Set(parsed.data.schools.map((school) => school.unitid))].sort(
    (left, right) => left - right,
  );

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

  let subjectId: string | null;
  try {
    subjectId = await subjectIdFromBearer(request, supabase);
  } catch {
    return NextResponse.json(
      { error: "Invalid Supabase user bearer token." },
      { status: 401 },
    );
  }

  const { data: schools, error: schoolError } = await supabase
    .from("schools")
    .select("unitid,name,country,admission_system")
    .in("unitid", unitids);

  if (schoolError) {
    return NextResponse.json(
      { error: "Unable to load command-center schools." },
      { status: 500 },
    );
  }

  const { data: programs, error: programError } = await supabase
    .from("program_requirements")
    .select(
      "id,unitid,program_name,system,cutoff_avg_low,cutoff_avg_high,cutoff_basis,prerequisites,test_policy,supplemental_app,broad_based_admission,source_url",
    )
    .in("unitid", unitids);

  if (programError) {
    return NextResponse.json(
      { error: "Unable to load program requirements." },
      { status: 500 },
    );
  }

  const { data: deadlines, error: deadlineError } = await supabase
    .from("application_deadlines")
    .select(
      "id,unitid,program_requirement_id,admission_system,deadline_kind,label,deadline_date,source_url,source_name",
    )
    .in("unitid", unitids);

  if (deadlineError) {
    return NextResponse.json(
      { error: "Unable to load application deadlines." },
      { status: 500 },
    );
  }

  let statuses: CommandCenterRequirementStatus[] = [];
  let documents: CommandCenterDocument[] = [];

  if (subjectId) {
    const { data: statusRows, error: statusError } = await supabase
      .from("requirement_status")
      .select("unitid,program_requirement_id,requirement_key,status,source_url")
      .eq("subject_id", subjectId)
      .in("unitid", unitids);

    if (statusError) {
      return NextResponse.json(
        { error: "Unable to load requirement status." },
        { status: 500 },
      );
    }

    statuses = (statusRows ?? []) as CommandCenterRequirementStatus[];
  }

  let plan = assembleCommandCenter({
    schools: (schools ?? []) as CommandCenterSchool[],
    programRequirements: (programs ?? []) as CommandCenterProgramRequirement[],
    deadlines: (deadlines ?? []) as CommandCenterDeadline[],
    statuses,
  });

  if (subjectId && plan.progress.total > 0) {
    const taskRows = plan.schools.flatMap((schoolPlan) =>
      schoolPlan.tasks.map((task) => ({
        subject_id: subjectId,
        unitid: task.unitid,
        program_requirement_id: task.program_requirement_id,
        requirement_key: task.requirement_key,
        title: task.title,
        detail: task.detail,
        category: task.category,
        status: task.status,
        due_date: task.due_date,
        source_url: task.source_url,
      })),
    );

    const { error: taskError } = await supabase
      .from("tasks")
      .upsert(taskRows, { onConflict: "subject_id,unitid,requirement_key" });

    if (taskError) {
      return NextResponse.json(
        { error: "Unable to save command-center tasks." },
        { status: 500 },
      );
    }

    const { data: documentRows, error: documentError } = await supabase
      .from("documents")
      .select(
        "id,unitid,requirement_key,file_name,content_type,size_bytes,status,created_at",
      )
      .eq("subject_id", subjectId)
      .eq("status", "uploaded");

    if (documentError) {
      return NextResponse.json(
        { error: "Unable to load document vault." },
        { status: 500 },
      );
    }

    documents = (documentRows ?? []) as CommandCenterDocument[];
    plan = { ...plan, documents };
  }

  return NextResponse.json(plan);
}
