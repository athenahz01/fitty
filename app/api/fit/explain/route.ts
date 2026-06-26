import { NextResponse } from "next/server";
import { z } from "zod";

import { fitFinderEnabled } from "@/lib/fit/server";

export const runtime = "nodejs";

const DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const textListSchema = z.array(z.string().trim().min(1).max(180)).max(12);

const explainRequestSchema = z
  .object({
    school: z
      .object({
        unitid: z.number().int(),
        name: z.string().trim().min(1).max(180),
        country: z.enum(["US", "CA"]).optional(),
        province_state: z.string().trim().max(80).nullable().optional(),
        region: z.string().trim().max(80).nullable().optional(),
        size_band: z.string().trim().max(40).nullable().optional(),
        setting: z.string().trim().max(40).nullable().optional(),
        selectivity_tier: z.string().trim().max(80).nullable().optional(),
        program_areas: textListSchema.nullable().optional(),
      })
      .strict(),
    match_reasons: z
      .object({
        matched: textListSchema,
        notable: textListSchema,
        cost_status: z.enum(["within_ceiling", "over_ceiling", "unknown"]),
      })
      .strict(),
    band: z
      .object({
        label: z.enum(["reach", "target", "likely"]),
        low: z.number().min(0).max(1),
        high: z.number().min(0).max(1),
        wide_band: z.boolean(),
      })
      .strict(),
  })
  .strict();

const systemPrompt = [
  "Write 2 to 3 plain sentences explaining why this school fits this student.",
  "Use only the JSON attributes provided in the user message.",
  "Do not use outside knowledge, rankings, reputation, programs, statistics, locations, or claims not present in the JSON.",
  "Do not invent facts.",
  "Do not overpromise or say the student will get in.",
  "If you mention chances, describe the range using the provided low and high values, never a single admit number.",
  "Keep the tone calm, honest, and specific.",
  "Do not use em dashes.",
].join(" ");

function fallbackResponse(reason: string) {
  return NextResponse.json({
    available: false,
    explanation: null,
    reason,
  });
}

function sanitizeExplanation(text: string) {
  return text.replace(/[\u2014\u2013]/g, "-").replace(/\s+/g, " ").trim();
}

function hasOverpromise(text: string) {
  return /\b(guarantee|guaranteed|you will get in|you'll get in|certain admit|sure thing)\b/i.test(
    text,
  );
}

function extractText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }
      const typedBlock = block as { type?: unknown; text?: unknown };
      return typedBlock.type === "text" && typeof typedBlock.text === "string"
        ? typedBlock.text
        : "";
    })
    .join(" ")
    .trim();
}

export async function POST(request: Request) {
  if (!fitFinderEnabled()) {
    return NextResponse.json({ error: "Fit Finder is not enabled." }, { status: 404 });
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

  const parsed = explainRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Explanation request included unsupported fields." },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fallbackResponse("Claude explanation is not configured.");
  }

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 150,
        temperature: 0.1,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: JSON.stringify(parsed.data),
          },
        ],
      }),
    });

    if (!response.ok) {
      return fallbackResponse("Claude explanation is temporarily unavailable.");
    }

    const payload = await response.json();
    const explanation = sanitizeExplanation(extractText(payload));

    if (!explanation || hasOverpromise(explanation)) {
      return fallbackResponse("Claude explanation did not pass safety checks.");
    }

    return NextResponse.json({
      available: true,
      model,
      explanation,
    });
  } catch {
    return fallbackResponse("Claude explanation is temporarily unavailable.");
  } finally {
    clearTimeout(timeout);
  }
}
