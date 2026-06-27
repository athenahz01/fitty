import { NextResponse } from "next/server";

import {
  buildGrounding,
  detectGhostwritingRequest,
  ghostwritingRefusal,
  looksGhostwritten,
  type EssayPattern,
  type NarrativeRequest,
} from "@/lib/narrative";
import {
  formatValidationError,
  narrativeRequestSchema,
} from "@/lib/narrative/schema";
import {
  narrativeConfigured,
  narrativeEnabled,
  narrativePrompts,
  retrieveExemplars,
  streamNarrativeFeedback,
} from "@/lib/narrative/server";
import { assertNoForbiddenDemographicKeys } from "@/lib/outcomes/schemas";

export const runtime = "nodejs";

type RateBucket = { count: number; resetAt: number };

const RATE_LIMIT = 8;
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

export async function POST(request: Request) {
  if (!narrativeEnabled()) {
    return NextResponse.json(
      { error: "Narrative Studio is not enabled." },
      { status: 404 },
    );
  }

  if (!checkRateLimit(request)) {
    return NextResponse.json(
      { error: "Too many narrative requests. Try again in a minute." },
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

  const parsed = narrativeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error) },
      { status: 400 },
    );
  }

  const requestData = parsed.data as NarrativeRequest;

  // No-ghostwriting gate: if the student's text is an instruction to write or
  // rewrite the essay, refuse and redirect to feedback WITHOUT calling the model.
  const ghostwriteProbe = [
    requestData.essay_text,
    ...(requestData.activities ?? []),
  ].join("\n");
  if (detectGhostwritingRequest(ghostwriteProbe)) {
    return NextResponse.json(ghostwritingRefusal(), { status: 200 });
  }

  // RAG retrieval (best-effort) + deterministic grounding. Numbers shown to the
  // student come from this grounding (data layer), never from the model.
  let exemplars: EssayPattern[];
  try {
    exemplars = await retrieveExemplars(requestData);
  } catch {
    exemplars = [];
  }
  const grounding = buildGrounding({
    school: requestData.school,
    exemplars,
  });

  // If the Anthropic key is not configured, return the grounding so the UI still
  // shows what feedback would be based on, without any model prose.
  if (!narrativeConfigured()) {
    return NextResponse.json({
      available: false,
      grounding,
      reason: "Narrative feedback model is not configured.",
    });
  }

  const { system, user } = narrativePrompts({ request: requestData, exemplars });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // First frame: the deterministic grounding (the traceable basis + any
      // data-sourced numbers). The model has not run yet.
      controller.enqueue(encoder.encode(sseFrame("grounding", grounding)));

      let accumulated = "";
      let blocked = false;
      try {
        for await (const delta of streamNarrativeFeedback({ system, user })) {
          accumulated += delta;
          // Output guard: if the stream starts to read like a ghostwritten
          // essay, stop and emit a safety notice instead.
          if (looksGhostwritten(accumulated)) {
            blocked = true;
            break;
          }
          controller.enqueue(encoder.encode(sseFrame("delta", { text: delta })));
        }

        if (blocked) {
          controller.enqueue(
            encoder.encode(
              sseFrame("safety", {
                message:
                  "Feedback was stopped because it began producing essay prose. Admira only returns suggestions on your own writing.",
              }),
            ),
          );
        }
        controller.enqueue(encoder.encode(sseFrame("done", { blocked })));
      } catch {
        controller.enqueue(
          encoder.encode(
            sseFrame("error", {
              message: "Narrative feedback is temporarily unavailable.",
            }),
          ),
        );
      } finally {
        controller.close();
      }
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
