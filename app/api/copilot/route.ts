import { NextResponse } from "next/server";

import {
  answerFromToolResults,
  assertChatNumbersCameFromTools,
  availableTools,
  planCopilotTools,
  runCopilotTool,
  type CopilotToolInputs,
  type CopilotToolResult,
} from "@/lib/copilot";
import {
  copilotConfigured,
  copilotEnabled,
  streamCopilotQualitativeText,
} from "@/lib/copilot/server";
import {
  copilotRequestSchema,
  formatValidationError,
  type CopilotActionInput,
  type CopilotRequestInput,
} from "@/lib/copilot/schema";
import type { CommandCenterDeadline, CommandCenterDocument, CommandCenterProgramRequirement, CommandCenterRequirementStatus, CommandCenterSchool } from "@/lib/command-center";
import type { CompassCareer, CompassMajor } from "@/lib/compass";
import type { ListCandidate } from "@/lib/list-builder";
import type { InferenceSchool } from "@/lib/model/inference";
import { assertNoForbiddenDemographicKeys } from "@/lib/outcomes/schemas";
import { studentsLikeYouResponse } from "@/lib/similarity";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RateBucket = { count: number; resetAt: number };

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, RateBucket>();

function requesterKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

function checkRateLimit(request: Request) {
  const key = requesterKey(request);
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT) {
    return false;
  }
  current.count += 1;
  return true;
}

function sseFrame(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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

async function persistRequirementStatus(
  request: Request,
  action: CopilotActionInput,
) {
  const supabase = createSupabaseServiceRoleClient();
  const subjectId = await requireSubjectId(request, supabase);
  const row = {
    subject_id: subjectId,
    unitid: action.unitid,
    program_requirement_id: action.program_requirement_id ?? null,
    requirement_key: action.requirement_key,
    status: action.status,
    source_url: action.source_url ?? null,
  };

  const { error } = await supabase
    .from("requirement_status")
    .upsert(row, { onConflict: "subject_id,unitid,requirement_key" });

  if (error) {
    throw new Error("Unable to update requirement status.");
  }
}

type SimilarityRows = Parameters<typeof studentsLikeYouResponse>[0]["rows"];

function buildToolInputs(parsed: CopilotRequestInput): CopilotToolInputs {
  const schools = parsed.schools as InferenceSchool[];
  const primarySchool = schools[0];
  const profile = parsed.profile;
  const inputs: CopilotToolInputs = {};

  if (primarySchool && profile) {
    inputs.admit_intelligence = {
      school: primarySchool,
      input: {
        unitid: primarySchool.unitid,
        sat_score: profile.sat_score,
        act_score: profile.act_score,
        gpa: profile.gpa,
        application_round: profile.application_round,
        intended_major: profile.intended_major,
        activity_context: profile.activity_context,
      },
    };
  }

  if (schools.length > 0 && profile) {
    inputs.climb_roadmap = {
      profile: {
        sat_score: profile.sat_score,
        act_score: profile.act_score,
        gpa: profile.gpa,
        application_round: profile.application_round,
        intended_major: profile.intended_major,
        activity_context: profile.activity_context,
      },
      schools,
    };
    inputs.list_builder = {
      profile: {
        sat_score: profile.sat_score,
        act_score: profile.act_score,
        gpa: profile.gpa,
        application_round: profile.application_round,
      },
      preferences: {
        intended_major: profile.intended_major,
        interests: parsed.interests,
      },
      candidates: schools.map((school) => ({
        ...school,
        country:
          school && "country" in school && typeof school.country === "string"
            ? school.country
            : "US",
      })) as ListCandidate[],
    };
  }

  const commandContext = parsed.tool_context?.command_center;
  if (commandContext) {
    inputs.command_center = {
      schools: commandContext.schools as CommandCenterSchool[],
      programRequirements:
        commandContext.program_requirements as CommandCenterProgramRequirement[],
      deadlines: commandContext.deadlines as CommandCenterDeadline[],
      statuses: commandContext.statuses as CommandCenterRequirementStatus[] | undefined,
      documents: commandContext.documents as CommandCenterDocument[] | undefined,
    };
  } else if (schools.length > 0) {
    inputs.command_center = {
      schools: schools.map((school) => ({
        unitid: school.unitid,
        name: school.name,
        country:
          school && "country" in school && typeof school.country === "string"
            ? school.country
            : "US",
        admission_system: null,
      })) as CommandCenterSchool[],
      programRequirements: [],
      deadlines: [],
    };
  }

  const similarContext = parsed.tool_context?.students_like_you;
  if (similarContext) {
    inputs.students_like_you = {
      rows: similarContext.rows as SimilarityRows,
      model: similarContext.model,
      dim: similarContext.dim,
    };
  }

  const compassContext = parsed.tool_context?.compass;
  if (compassContext) {
    inputs.major_compass = {
      majors: compassContext.majors as CompassMajor[],
      careers: compassContext.careers as CompassCareer[],
      studentInterests: compassContext.student_interests,
      majorSimilarity: compassContext.major_similarity,
      school: (compassContext.school ?? primarySchool) as InferenceSchool | undefined,
      profile: profile
        ? {
            sat_score: profile.sat_score,
            act_score: profile.act_score,
            gpa: profile.gpa,
            application_round: profile.application_round,
          }
        : undefined,
    };
  }

  if (parsed.action) {
    inputs.update_command_center_status = parsed.action;
  }

  return inputs;
}

export async function POST(request: Request) {
  if (!copilotEnabled()) {
    return NextResponse.json(
      { error: "Admira Copilot is not enabled." },
      { status: 404 },
    );
  }

  if (!checkRateLimit(request)) {
    return NextResponse.json(
      { error: "Too many Copilot requests. Try again in a minute." },
      { status: 429 },
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

  try {
    assertNoForbiddenDemographicKeys(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Forbidden key." },
      { status: 400 },
    );
  }

  const parsed = copilotRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error) },
      { status: 400 },
    );
  }

  if (parsed.data.action) {
    try {
      await persistRequirementStatus(request, parsed.data.action);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to update requirement status.",
        },
        { status: 401 },
      );
    }
  }

  const toolInputs = buildToolInputs(parsed.data);
  let planned = availableTools(planCopilotTools(parsed.data.message), toolInputs);
  if (planned.length === 0 && toolInputs.admit_intelligence) {
    planned = ["admit_intelligence"];
  }

  const results: CopilotToolResult[] = [];
  for (const toolName of planned) {
    try {
      results.push(runCopilotTool(toolName, toolInputs));
    } catch {
      // The registry is deterministic; missing optional context simply means no receipt.
    }
  }

  const answer = answerFromToolResults({
    message: parsed.data.message,
    results,
  });

  try {
    assertChatNumbersCameFromTools({ text: answer, results });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Copilot produced an ungrounded number.",
      },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const result of results) {
        controller.enqueue(encoder.encode(sseFrame("tool_result", result)));
      }
      controller.enqueue(encoder.encode(sseFrame("answer", { text: answer })));

      if (copilotConfigured() && results.length > 0) {
        try {
          for await (const text of streamCopilotQualitativeText({
            message: parsed.data.message,
            results,
            profile: {
              intended_major: parsed.data.profile?.intended_major,
              application_round: parsed.data.profile?.application_round,
              interests: parsed.data.interests,
            },
          })) {
            controller.enqueue(encoder.encode(sseFrame("delta", { text })));
          }
        } catch {
          controller.enqueue(
            encoder.encode(
              sseFrame("model_notice", {
                message: "Qualitative model prose is temporarily unavailable.",
              }),
            ),
          );
        }
      }

      controller.enqueue(encoder.encode(sseFrame("done", { ok: true })));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
