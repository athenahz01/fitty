// Narrative & Essay Studio — pure, testable core (Phase 6).
//
// This module builds the GROUNDED prompt for school-specific, profile-aware
// essay feedback and enforces the hard contract: the tool gives feedback,
// diagnostics, and targeted suggestions about the student's OWN text — it never
// ghostwrites, never rewrites the essay wholesale, and never emits numbers.
//
// What is pure here (no network, no env): ghostwriting detection, the system
// prompt, the grounded user message, the deterministic grounding metadata, the
// RAG retrieval over the curated essay-pattern corpus, and the output guard.
// The single Anthropic streaming call lives behind a thin server client; numbers
// shown in the UI come from the deterministic data/model layer, never the model.

export type EssayType = "personal_statement" | "supplement" | "activity_list";

export type EssayPattern = {
  id: string;
  theme: string;
  pattern: string;
  applies_to: EssayType[];
  provenance: string;
  source_url: string;
};

export type NarrativeSchool = {
  unitid: number;
  name: string;
  c7_factors?: Record<string, unknown> | null;
};

export type NarrativeRequest = {
  essay_type: EssayType;
  essay_text: string;
  activities?: string[];
  school?: NarrativeSchool;
};

export type C7Priority = { factor: string; importance: string };

export type ExemplarReference = {
  id: string;
  theme: string;
  source_url: string;
};

// Everything the feedback was grounded in — assembled deterministically so the
// audit can trace it. No free-floating GPT output.
export type NarrativeGrounding = {
  c7_priorities: C7Priority[];
  exemplars_used: ExemplarReference[];
  // Optional admit context: a number that, if shown, comes from the Phase 1
  // engine (data/model), NEVER from the language model.
  admit_context: { tier: string; score: number } | null;
};

export const NARRATIVE_METHOD = "narrative_grounded_feedback_v1";

// C7 importance ratings that count as a "priority" for grounding.
const PRIORITY_RATINGS = new Set(["Very Important", "Important"]);

// Phrases that indicate the user is asking the assistant to WRITE/REWRITE the
// essay for them, rather than asking for feedback on their own draft.
const GHOSTWRITE_PATTERNS: RegExp[] = [
  /\bwrite\s+(?:me\s+|my\s+|a\s+|an\s+|the\s+)?(?:college\s+|personal\s+|admissions?\s+)?essay\b/i,
  /\b(?:draft|compose|generate|create)\s+(?:me\s+|my\s+|a\s+|an\s+|the\s+)?(?:college\s+|personal\s+|admissions?\s+)?essay\b/i,
  /\brewrite\s+(?:this|my|the)\b/i,
  /\b(?:do|write)\s+my\s+(?:essay|homework|application)\b/i,
  /\bwrite\s+it\s+for\s+me\b/i,
  /\bcan\s+you\s+write\b/i,
  /\bmake\s+(?:me\s+)?(?:a|an|the)\s+essay\b/i,
];

// Phrases the MODEL output must not contain — they would indicate it produced a
// draftable/rewritten essay instead of feedback.
const GHOSTWRITTEN_OUTPUT_PATTERNS: RegExp[] = [
  /\bhere(?:'s| is)\s+(?:your|a|the|an)\s+(?:revised|rewritten|new|polished|improved|final)?\s*(?:essay|draft|version|statement)\b/i,
  /\b(?:revised|rewritten|polished|final)\s+(?:essay|draft|version|statement)\s*:/i,
  /\byou\s+(?:could|can|should)\s+(?:submit|use)\s+this\b/i,
];

export function detectGhostwritingRequest(text: string): boolean {
  return GHOSTWRITE_PATTERNS.some((pattern) => pattern.test(text));
}

// Guard on the model's streamed output. Returns whether the text reads like a
// ghostwritten essay rather than feedback.
export function looksGhostwritten(text: string): boolean {
  return GHOSTWRITTEN_OUTPUT_PATTERNS.some((pattern) => pattern.test(text));
}

export function c7PrioritiesFrom(school?: NarrativeSchool): C7Priority[] {
  const factors = school?.c7_factors;
  if (!factors || typeof factors !== "object") {
    return [];
  }
  return Object.entries(factors)
    .filter(
      ([key, value]) =>
        key !== "_source" && typeof value === "string" && PRIORITY_RATINGS.has(value),
    )
    .map(([factor, value]) => ({ factor, importance: String(value) }))
    .sort((left, right) => left.factor.localeCompare(right.factor));
}

function cosine(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

// Pure RAG retrieval: rank corpus patterns (filtered to the essay type) by
// cosine of their precomputed embedding against the query embedding. The caller
// (server) supplies the embeddings; this stays deterministic and testable.
export function retrievePatterns(input: {
  patterns: EssayPattern[];
  patternVectors: Record<string, number[]>;
  queryVector: number[];
  essayType: EssayType;
  k: number;
}): EssayPattern[] {
  return input.patterns
    .filter((pattern) => pattern.applies_to.includes(input.essayType))
    .map((pattern) => ({
      pattern,
      score: cosine(input.queryVector, input.patternVectors[pattern.id] ?? []),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.pattern.id.localeCompare(right.pattern.id);
    })
    .slice(0, Math.max(0, input.k))
    .map((entry) => entry.pattern);
}

export function buildGrounding(input: {
  school?: NarrativeSchool;
  exemplars: EssayPattern[];
  admitContext?: { tier: string; score: number } | null;
}): NarrativeGrounding {
  return {
    c7_priorities: c7PrioritiesFrom(input.school),
    exemplars_used: input.exemplars.map((pattern) => ({
      id: pattern.id,
      theme: pattern.theme,
      source_url: pattern.source_url,
    })),
    admit_context: input.admitContext ?? null,
  };
}

// The system prompt encodes the hard contract. The audit reads this verbatim.
export function buildSystemPrompt(): string {
  return [
    "You are an essay-feedback coach for a college applicant. You give feedback, diagnostics, and targeted suggestions about the student's OWN writing.",
    "Absolute rules:",
    "1. NEVER write, draft, compose, or rewrite an essay or any submittable prose for the student. Do not output replacement sentences or paragraphs the student could paste in.",
    "2. When you suggest an improvement, quote a SHORT snippet (a few words) of the student's own sentence and describe the direction to take it. Do not provide the finished rewritten sentence.",
    "3. Preserve the student's voice. Your suggestions stay inside their diction and intent; you never replace their writing with generic polished prose.",
    "4. Do NOT include any numbers or figures (no admit rates, scores, percentages, salaries, counts, or years). Speak only qualitatively. Numeric context is shown to the student separately by the app.",
    "5. Ground your feedback in the provided school priorities and the provided essay-craft patterns. Do not use outside facts, rankings, or statistics.",
    "6. If the request is to write or rewrite the essay, refuse and redirect to feedback on their existing draft. Never provide an AI-detection-evasion or 'humanizer' transformation.",
    "Organize feedback as: Strengths; Gaps versus this school's stated priorities; Specific suggestions (each quoting a short snippet of the student's own text); and a coherence note. For an activity list, give entry-by-entry feedback on verbs and impact. Keep it concise and specific. Do not use em dashes.",
  ].join("\n");
}

// The grounded user message. Carries the student's text, the school's stated
// priorities, and the retrieved essay-craft patterns — explicitly framed so the
// model critiques rather than rewrites.
export function buildUserMessage(input: {
  request: NarrativeRequest;
  c7Priorities: C7Priority[];
  exemplars: EssayPattern[];
}): string {
  const priorities =
    input.c7Priorities.length > 0
      ? input.c7Priorities.map((p) => `- ${p.factor}: ${p.importance}`).join("\n")
      : "- No school-specific priorities were provided; give general craft feedback.";

  const patterns = input.exemplars
    .map((pattern) => `- ${pattern.theme}: ${pattern.pattern}`)
    .join("\n");

  const essaySection =
    input.request.essay_type === "activity_list"
      ? `ACTIVITY ENTRIES (the student's own, give entry-by-entry feedback, never rewrite):\n${(input.request.activities ?? [])
          .map((entry, index) => `${index + 1}. ${entry}`)
          .join("\n")}`
      : `STUDENT'S DRAFT (their own writing — critique it, never rewrite it):\n"""\n${input.request.essay_text}\n"""`;

  return [
    `Essay type: ${input.request.essay_type}`,
    input.request.school ? `Target school: ${input.request.school.name}` : "Target school: not specified",
    "",
    "THIS SCHOOL'S STATED PRIORITIES (from its Common Data Set):",
    priorities,
    "",
    "ESSAY-CRAFT PATTERNS TO GROUND YOUR FEEDBACK IN:",
    patterns || "- (none retrieved)",
    "",
    essaySection,
    "",
    "Give feedback following your rules. Quote short snippets of the student's own words. Do not write replacement prose. Do not include any numbers.",
  ].join("\n");
}

// Structured refusal returned WITHOUT calling the model when the input asks for
// ghostwriting. Redirects to feedback.
export function ghostwritingRefusal() {
  return {
    refused: true as const,
    reason:
      "Admira gives feedback on your own writing — it will not write or rewrite an essay for you. Paste your draft and you'll get specific, grounded suggestions you apply yourself.",
  };
}
