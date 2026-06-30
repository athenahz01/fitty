import { describe, expect, it } from "vitest";

import {
  buildGrounding,
  buildSystemPrompt,
  buildUserMessage,
  c7PrioritiesFrom,
  detectGhostwritingRequest,
  ghostwritingRefusal,
  looksGhostwritten,
  retrievePatterns,
  type EssayPattern,
} from "../index";

const patterns: EssayPattern[] = [
  {
    id: "specificity",
    theme: "Specificity over summary",
    pattern: "Show one concrete moment.",
    applies_to: ["personal_statement", "supplement"],
    provenance: "curated_public",
    source_url: "https://example.org/specificity",
  },
  {
    id: "activity-impact",
    theme: "Action plus impact",
    pattern: "Lead with a vivid verb.",
    applies_to: ["activity_list"],
    provenance: "curated_public",
    source_url: "https://example.org/activity",
  },
];

describe("Narrative no-ghostwriting contract", () => {
  it("detects write-my-essay requests and refuses them", () => {
    expect(detectGhostwritingRequest("Write my college essay for me about robotics")).toBe(
      true,
    );
    expect(detectGhostwritingRequest("Can you write it for me?")).toBe(true);
    expect(detectGhostwritingRequest("Please rewrite this paragraph")).toBe(true);
    expect(
      detectGhostwritingRequest(
        "Here is my draft. I built a robot for my school's team and learned to lead.",
      ),
    ).toBe(false);

    expect(ghostwritingRefusal().refused).toBe(true);
  });

  it("the system prompt forbids drafting/rewriting and emitting numbers", () => {
    const system = buildSystemPrompt().toLowerCase();
    expect(system).toContain("never write");
    expect(system).toContain("rewrite");
    expect(system).toContain("voice");
    // No-number-hallucination: the model is told to stay qualitative.
    expect(system).toContain("do not include any numbers");
    // No AI-detection evasion / humanizer feature.
    expect(system).toContain("humanizer");
  });

  it("flags model output that reads like a ghostwritten essay", () => {
    expect(looksGhostwritten("Here is your revised essay: Ever since I was young")).toBe(
      true,
    );
    expect(
      looksGhostwritten(
        "Strengths: your opening is specific. Suggestion: tighten the phrase 'I learned a lot'.",
      ),
    ).toBe(false);
  });

  it("demands specific, quote-anchored feedback and bans vague platitudes", () => {
    const system = buildSystemPrompt().toLowerCase();
    // Each suggestion must quote the student's own words and tie to a priority.
    expect(system).toContain("quote a short snippet of the student's actual words");
    expect(system).toContain("banned vague advice");
    expect(system).toContain("show don't tell");
    // The model is explicitly told not to use the banned voice words in output.
    expect(system).toContain("do not use the words 'honest' or 'confident'");
  });
});

describe("Narrative grounding is traceable", () => {
  it("extracts only real C7 priorities from the school", () => {
    const priorities = c7PrioritiesFrom({
      unitid: 1,
      name: "Test U",
      c7_factors: {
        _source: "2023-24 CDS",
        rigor: "Very Important",
        essay: "Important",
        test_scores: "Considered",
        first_generation: "Not Considered",
      },
    });
    const factors = priorities.map((priority) => priority.factor);
    expect(factors).toContain("rigor");
    expect(factors).toContain("essay");
    expect(factors).not.toContain("test_scores");
    expect(factors).not.toContain("_source");
  });

  it("carries the exemplars and source_urls it was grounded in", () => {
    const grounding = buildGrounding({
      school: { unitid: 1, name: "Test U", c7_factors: { essay: "Very Important" } },
      exemplars: [patterns[0]],
    });
    expect(grounding.c7_priorities[0].factor).toBe("essay");
    expect(grounding.exemplars_used).toEqual([
      {
        id: "specificity",
        theme: "Specificity over summary",
        source_url: "https://example.org/specificity",
      },
    ]);
    // admit_context is the only numeric channel and defaults to data/null,
    // never produced by the model.
    expect(grounding.admit_context).toBeNull();
  });

  it("retrieves only patterns for the essay type, ranked by similarity", () => {
    const result = retrievePatterns({
      patterns,
      patternVectors: {
        specificity: [1, 0, 0],
        "activity-impact": [0, 1, 0],
      },
      queryVector: [1, 0, 0],
      essayType: "personal_statement",
      k: 5,
    });
    expect(result.map((pattern) => pattern.id)).toEqual(["specificity"]);
  });
});

describe("Narrative user message frames critique, not rewriting", () => {
  it("includes the student's text, school priorities, and grounding patterns", () => {
    const message = buildUserMessage({
      request: {
        essay_type: "personal_statement",
        essay_text: "I built a robot and it broke twice before it worked.",
        school: { unitid: 1, name: "Test U", c7_factors: { essay: "Very Important" } },
      },
      c7Priorities: c7PrioritiesFrom({
        unitid: 1,
        name: "Test U",
        c7_factors: { essay: "Very Important" },
      }),
      exemplars: [patterns[0]],
    });
    expect(message).toContain("never rewrite");
    expect(message).toContain("I built a robot");
    expect(message).toContain("Specificity over summary");
    expect(message.toLowerCase()).toContain("do not include any numbers");
  });
});
