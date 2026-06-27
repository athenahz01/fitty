import "server-only";

import corpusData from "../../pipeline/data/essay_pattern_corpus.json";
import { embedFitDocuments } from "../fit/embed-query";
import { EMBEDDING_DIM, EMBEDDING_MODEL_ID } from "../fit/embedding-model";

import {
  buildSystemPrompt,
  buildUserMessage,
  c7PrioritiesFrom,
  retrievePatterns,
  type EssayPattern,
  type NarrativeRequest,
} from "./index";

export function narrativeEnabled() {
  return process.env.ADMIRA_NARRATIVE_ENABLED === "true";
}

const DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const NARRATIVE_EXEMPLAR_COUNT = 3;

function loadCorpus(): EssayPattern[] {
  const patterns = (corpusData as { patterns?: unknown }).patterns;
  if (!Array.isArray(patterns)) {
    return [];
  }
  return patterns.filter(
    (pattern): pattern is EssayPattern =>
      Boolean(pattern) &&
      typeof pattern === "object" &&
      typeof (pattern as EssayPattern).id === "string" &&
      typeof (pattern as EssayPattern).source_url === "string",
  );
}

const corpus = loadCorpus();
let patternVectorsPromise: Promise<Record<string, number[]>> | null = null;

function getPatternVectors() {
  if (!patternVectorsPromise) {
    patternVectorsPromise = embedFitDocuments(
      corpus.map((pattern) => `${pattern.theme}. ${pattern.pattern}`),
    ).then((vectors) => {
      const map: Record<string, number[]> = {};
      corpus.forEach((pattern, index) => {
        map[pattern.id] = vectors[index];
      });
      return map;
    });
  }
  return patternVectorsPromise;
}

// Retrieve the closest essay-craft patterns for this request (RAG). The query
// embeds the student's text plus the school's stated priorities so retrieval is
// both topic- and priority-aware.
export async function retrieveExemplars(
  request: NarrativeRequest,
  k = NARRATIVE_EXEMPLAR_COUNT,
): Promise<EssayPattern[]> {
  if (corpus.length === 0) {
    return [];
  }
  const priorities = c7PrioritiesFrom(request.school)
    .map((priority) => priority.factor)
    .join(", ");
  const essayText =
    request.essay_type === "activity_list"
      ? (request.activities ?? []).join(" ")
      : request.essay_text;
  const queryDoc = [
    `Essay type: ${request.essay_type}.`,
    priorities ? `School priorities: ${priorities}.` : "",
    essayText.slice(0, 1500),
  ]
    .filter(Boolean)
    .join(" ");

  const [queryVector] = await embedFitDocuments([queryDoc]);
  const patternVectors = await getPatternVectors();

  return retrievePatterns({
    patterns: corpus,
    patternVectors,
    queryVector,
    essayType: request.essay_type,
    k,
  });
}

export function narrativePrompts(input: {
  request: NarrativeRequest;
  exemplars: EssayPattern[];
}) {
  return {
    system: buildSystemPrompt(),
    user: buildUserMessage({
      request: input.request,
      c7Priorities: c7PrioritiesFrom(input.request.school),
      exemplars: input.exemplars,
    }),
  };
}

export function narrativeModel() {
  return process.env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL;
}

export function narrativeConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export { EMBEDDING_DIM, EMBEDDING_MODEL_ID };

// Thin streaming client around the single Anthropic call. Yields qualitative
// text deltas only; numbers are injected by the route's grounding frame, never
// here. Raw essay text is never logged.
export async function* streamNarrativeFeedback(input: {
  system: string;
  user: string;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Narrative feedback is not configured.");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: input.signal,
    body: JSON.stringify({
      model: narrativeModel(),
      max_tokens: 900,
      temperature: 0.3,
      system: input.system,
      messages: [{ role: "user", content: input.user }],
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error("Narrative feedback is temporarily unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const payload = trimmed.slice("data:".length).trim();
      if (!payload || payload === "[DONE]") {
        continue;
      }
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: { type?: string; text?: string };
        };
        if (
          event.type === "content_block_delta" &&
          event.delta?.type === "text_delta" &&
          typeof event.delta.text === "string"
        ) {
          yield event.delta.text;
        }
      } catch {
        // Ignore non-JSON keepalive lines.
      }
    }
  }
}
