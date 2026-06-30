import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildClimbRoadmap } from "../../climb";
import { assembleCommandCenter } from "../../command-center";
import { generateCompass } from "../../compass";
import { generateList } from "../../list-builder";
import { buildUsAdmitIntelligence } from "../../score/us";
import { studentsLikeYouResponse } from "../../similarity";
import {
  answerFromToolResults,
  assertChatNumbersCameFromTools,
  buildCopilotSystemPrompt,
  buildCopilotUserMessage,
  copilotToolRegistry,
  planCopilotTools,
  runCopilotTool,
  sanitizeModelText,
  summarizeResultsForModel,
} from "../index";

const usSchool = {
  unitid: 166683,
  name: "Massachusetts Institute of Technology",
  country: "US" as const,
  setting: "city",
  size: 4535,
  admit_rate: 0.0455,
  sat_25: 1520,
  sat_75: 1580,
  act_25: 34,
  act_75: 36,
  gpa_avg: null,
  test_policy: "required",
  c7_factors: {
    rigor: "Very Important",
    extracurriculars: "Important",
  },
  selectivity_tier: "elite",
  program_areas: ["Engineering"],
  programs: ["Computer Science"],
  net_price_avg: 22000,
  sticker_cost: 82000,
  similarity: 0.9,
};

const profile = {
  unitid: usSchool.unitid,
  sat_score: 1540,
  act_score: 35,
  gpa: 3.95,
  application_round: "regular" as const,
  intended_major: "Computer science",
  activity_context: "Robotics captain.",
};

const commandInput = {
  schools: [
    {
      unitid: usSchool.unitid,
      name: usSchool.name,
      country: "US",
      admission_system: "direct" as const,
    },
  ],
  programRequirements: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      unitid: usSchool.unitid,
      program_name: "Computer Science",
      system: "direct" as const,
      cutoff_avg_low: null,
      cutoff_avg_high: null,
      cutoff_basis: null,
      prerequisites: [],
      test_policy: "required" as const,
      supplemental_app: true,
      broad_based_admission: false,
      source_url: "https://example.com/requirements",
    },
  ],
  deadlines: [],
};

const similarRows: Parameters<typeof studentsLikeYouResponse>[0]["rows"] = [
  {
    unitid: usSchool.unitid,
    school_name: usSchool.name,
    cohort_size: 4,
    admitted_count: 2,
    denied_count: 2,
    waitlisted_count: 0,
    deferred_count: 0,
    admit_rate: 0.5,
    denied_rate: 0.5,
    waitlisted_rate: 0,
    deferred_rate: 0,
    similarity_min: 0.8,
    similarity_max: 0.9,
    attribute_cards: [{ kind: "gpa", label: "GPA band", value: "3.75-3.99", count: 4 }],
    admit_insights: [],
    provenance: { curated_public: 4, consented_user: 0, source_urls: [] },
  },
];

describe("copilot tool registry", () => {
  it("wraps the existing modules without a money tool", () => {
    expect(copilotToolRegistry.map((tool) => tool.name)).toEqual([
      "admit_intelligence",
      "list_builder",
      "students_like_you",
      "climb_roadmap",
      "command_center",
      "major_compass",
      "update_command_center_status",
    ]);
    expect(copilotToolRegistry.map((tool) => tool.wraps).join(" ")).toContain(
      "buildUsAdmitIntelligence",
    );
    expect(copilotToolRegistry.map((tool) => tool.wraps).join(" ")).toContain(
      "studentsLikeYouResponse",
    );
    expect(copilotToolRegistry.map((tool) => tool.name).join(" ")).not.toMatch(
      /cost|price|merit|roi|aid|money/i,
    );
  });

  it("delegates every read tool to the real module output", () => {
    const admit = runCopilotTool("admit_intelligence", {
      admit_intelligence: { input: profile, school: usSchool },
    });
    expect(admit.output).toEqual(buildUsAdmitIntelligence(profile, usSchool));

    const listInput = {
      profile,
      preferences: { intended_major: "Computer science", interests: "robotics" },
      candidates: [usSchool],
    };
    const list = runCopilotTool("list_builder", {
      list_builder: listInput,
    });
    expect(list.output).toEqual(generateList(listInput));

    const sly = runCopilotTool("students_like_you", {
      students_like_you: {
        rows: similarRows,
        model: "test-embedding",
        dim: 384,
      },
    });
    expect(sly.output).toEqual(
      studentsLikeYouResponse({ rows: similarRows, model: "test-embedding", dim: 384 }),
    );
    expect(sly.output.status).toBe("empty");

    const climbInput = {
      profile: {
        sat_score: profile.sat_score,
        act_score: profile.act_score,
        gpa: profile.gpa,
        application_round: profile.application_round,
      },
      schools: [usSchool],
    };
    const climb = runCopilotTool("climb_roadmap", {
      climb_roadmap: climbInput,
    });
    expect(climb.output).toEqual(
      buildClimbRoadmap(climbInput.profile, climbInput.schools),
    );

    const command = runCopilotTool("command_center", {
      command_center: commandInput,
    });
    expect(command.output).toEqual(assembleCommandCenter(commandInput));

    const compassInput = {
      majors: [
        {
          major_name: "Computer Science",
          median_earnings_10yr: 98000,
          source_url: "https://example.com/major",
        },
      ],
      careers: [
        {
          major_name: "Computer Science",
          career_title: "Software Developer",
          median_wage_annual: 132000,
          source_url: "https://example.com/career",
        },
      ],
      studentInterests: "robotics and computing",
      school: usSchool,
      profile,
    };
    const compass = runCopilotTool("major_compass", {
      major_compass: compassInput,
    });
    expect(compass.output).toEqual(generateCompass(compassInput));
  });

  it("keeps write receipts reversible and command-center scoped", () => {
    const action = runCopilotTool("update_command_center_status", {
      update_command_center_status: {
        type: "requirement_status",
        unitid: usSchool.unitid,
        requirement_key: "supplement",
        status: "done",
      },
    });

    expect(action.output).toEqual({
      type: "requirement_status",
      requirement_key: "supplement",
      status: "done",
      reversible: true,
    });
  });
});

describe("copilot number safety", () => {
  it("does not pass through model-invented numbers", () => {
    const sanitized = sanitizeModelText(
      "I estimate 88% odds and 42 remaining tasks with $5,000 in aid.",
    );

    expect(sanitized).not.toMatch(/\d|\$/);
    expect(sanitized).toContain("tool-only figure");
  });

  it("only renders numbers from tool receipts", () => {
    const result = runCopilotTool("admit_intelligence", {
      admit_intelligence: { input: profile, school: usSchool },
    });
    const answer = answerFromToolResults({
      message: "What are my admit odds?",
      results: [result],
    });

    expect(() =>
      assertChatNumbersCameFromTools({ text: answer, results: [result] }),
    ).not.toThrow();
    expect(answer).toContain(String(result.output.score));
  });

  it("refuses money questions without a numeric placeholder", () => {
    const answer = answerFromToolResults({
      message: "What will this cost and what is ROI?",
      results: [],
    });

    expect(answer).not.toMatch(/\d|\$/);
    expect(planCopilotTools("What will this cost?")).toEqual([]);
  });

  it("keeps the Anthropic key server-side", () => {
    const appSource = readFileSync("app/admira-app.tsx", "utf8");
    expect(appSource).not.toContain("ANTHROPIC_API_KEY");
  });
});

describe("copilot prompt construction", () => {
  const admit = runCopilotTool("admit_intelligence", {
    admit_intelligence: { input: profile, school: usSchool },
  });
  const climb = runCopilotTool("climb_roadmap", {
    climb_roadmap: {
      profile: {
        sat_score: profile.sat_score,
        act_score: profile.act_score,
        gpa: profile.gpa,
        application_round: profile.application_round,
      },
      schools: [usSchool],
    },
  });

  it("builds a number-free, grounded digest naming the modules", () => {
    const facts = summarizeResultsForModel([admit, climb]);
    expect(facts.length).toBe(2);
    expect(facts.join(" ")).toContain("Admit Intelligence");
    expect(facts.join(" ")).toContain("Climb");
    // The digest must hand the model qualitative grounding, never a figure.
    expect(facts.join(" ")).not.toMatch(/\d|\$|%/);
  });

  it("feeds the model the real profile and tool findings, not just 'received'", () => {
    const user = buildCopilotUserMessage({
      message: "Where should I focus to improve my odds?",
      results: [admit, climb],
      profile: {
        intended_major: "Computer science",
        application_round: "regular",
        interests: "robotics and embedded systems",
      },
    });

    expect(user).toContain("Where should I focus to improve my odds?");
    expect(user).toContain("Computer science");
    expect(user).toContain("robotics and embedded systems");
    expect(user).toContain("Admit Intelligence");
    expect(user).toContain("Climb");
    // The old prompt shipped {"received":true}; the new one must not.
    expect(user).not.toContain("received");
    // We never hand the model a figure to echo.
    expect(user).not.toMatch(/\d|\$|%/);
  });

  it("system prompt demands specificity and keeps every guard", () => {
    const system = buildCopilotSystemPrompt();
    expect(system).toContain("one concrete next step");
    expect(system).toMatch(/Do not restate/i);
    expect(system).toMatch(/Do not write any numeral/i);
    expect(system).toMatch(/net price|merit aid|ROI/i);
    // The model is explicitly told not to use the banned voice words in output.
    expect(system).toContain("Do not use the words 'honest' or 'confident'");
  });

  it("still rejects any number the model emits that no tool produced", () => {
    expect(() =>
      assertChatNumbersCameFromTools({
        text: "Your odds are about 73% at this school.",
        results: [],
      }),
    ).toThrow();
  });
});
