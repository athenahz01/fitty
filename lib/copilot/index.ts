import { buildClimbRoadmap, type ClimbRoadmap, type ClimbSchool } from "../climb";
import type { ClimbProfileInput } from "../climb/schema";
import {
  assembleCommandCenter,
  type CommandCenterDeadline,
  type CommandCenterDocument,
  type CommandCenterPlan,
  type CommandCenterProgramRequirement,
  type CommandCenterRequirementStatus,
  type CommandCenterSchool,
} from "../command-center";
import { generateCompass, type CompassResult } from "../compass";
import { generateList, type GeneratedList, type ListCandidate, type ListPreferences, type ListProfile } from "../list-builder";
import type { InferenceSchool } from "../model/inference";
import { buildUsAdmitIntelligence, type UsAdmitIntelligence, type UsAdmitIntelligenceInput } from "../score/us";
import { studentsLikeYouResponse, type StudentsLikeYouResponse } from "../similarity";

import type { CopilotActionInput } from "./schema";

export const COPILOT_NO_MONEY_MESSAGE =
  "Money is deferred to its own module, so I will not invent a cost or return figure.";

export type CopilotToolName =
  | "admit_intelligence"
  | "list_builder"
  | "students_like_you"
  | "climb_roadmap"
  | "command_center"
  | "major_compass"
  | "update_command_center_status";

type SimilarityRows = Parameters<typeof studentsLikeYouResponse>[0]["rows"];
type CompassInput = Parameters<typeof generateCompass>[0];

export type CommandCenterActionReceipt = {
  type: "requirement_status";
  requirement_key: string;
  status: CopilotActionInput["status"];
  reversible: true;
};

export type CopilotToolOutputs = {
  admit_intelligence: UsAdmitIntelligence;
  list_builder: GeneratedList;
  students_like_you: StudentsLikeYouResponse;
  climb_roadmap: ClimbRoadmap;
  command_center: CommandCenterPlan;
  major_compass: CompassResult;
  update_command_center_status: CommandCenterActionReceipt;
};

export type CopilotToolResult<T extends CopilotToolName = CopilotToolName> = {
  name: T;
  output: CopilotToolOutputs[T];
};

export type CopilotToolInputs = {
  admit_intelligence?: {
    input: UsAdmitIntelligenceInput;
    school: InferenceSchool;
  };
  list_builder?: {
    profile: ListProfile;
    preferences: ListPreferences;
    candidates: ListCandidate[];
  };
  students_like_you?: {
    rows: SimilarityRows;
    model: string;
    dim: number;
  };
  climb_roadmap?: {
    profile: ClimbProfileInput;
    schools: ClimbSchool[];
  };
  command_center?: {
    schools: CommandCenterSchool[];
    programRequirements: CommandCenterProgramRequirement[];
    deadlines: CommandCenterDeadline[];
    statuses?: CommandCenterRequirementStatus[];
    documents?: CommandCenterDocument[];
  };
  major_compass?: CompassInput;
  update_command_center_status?: CopilotActionInput;
};

export const copilotToolRegistry: Array<{
  name: CopilotToolName;
  wraps: string;
  write: boolean;
  reversible: boolean;
}> = [
  {
    name: "admit_intelligence",
    wraps: "lib/score/us.buildUsAdmitIntelligence",
    write: false,
    reversible: false,
  },
  {
    name: "list_builder",
    wraps: "lib/list-builder.generateList",
    write: false,
    reversible: false,
  },
  {
    name: "students_like_you",
    wraps: "lib/similarity.studentsLikeYouResponse",
    write: false,
    reversible: false,
  },
  {
    name: "climb_roadmap",
    wraps: "lib/climb.buildClimbRoadmap",
    write: false,
    reversible: false,
  },
  {
    name: "command_center",
    wraps: "lib/command-center.assembleCommandCenter",
    write: false,
    reversible: false,
  },
  {
    name: "major_compass",
    wraps: "lib/compass.generateCompass",
    write: false,
    reversible: false,
  },
  {
    name: "update_command_center_status",
    wraps: "app/api/command-center/requirements.PATCH",
    write: true,
    reversible: true,
  },
];

export function isMoneyQuestion(message: string) {
  return /\b(cost|net[-\s]?price|price|merit|scholarship|aid|tuition|roi|return|afford|budget)\b/i.test(
    message,
  );
}

export function planCopilotTools(message: string): CopilotToolName[] {
  if (isMoneyQuestion(message)) {
    return [];
  }

  const normalized = message.toLowerCase();
  const planned: CopilotToolName[] = [];

  function add(name: CopilotToolName) {
    if (!planned.includes(name)) {
      planned.push(name);
    }
  }

  if (/\b(mark|complete|done|finished|finish)\b/.test(normalized)) {
    add("update_command_center_status");
  }
  if (/\b(task|deadline|document|requirement|command center|next|focus)\b/.test(normalized)) {
    add("command_center");
  }
  if (/\b(similar|students like|cohort|people like me)\b/.test(normalized)) {
    add("students_like_you");
  }
  if (/\b(climb|improve|raise|move|scenario|what if)\b/.test(normalized)) {
    add("climb_roadmap");
  }
  if (/\b(list|reach|target|safety|balanced)\b/.test(normalized)) {
    add("list_builder");
  }
  if (/\b(major|career|compass|program)\b/.test(normalized)) {
    add("major_compass");
  }
  if (/\b(odds|chance|admit|admission|score|tier)\b/.test(normalized)) {
    add("admit_intelligence");
  }

  if (planned.length === 0) {
    add("command_center");
    add("climb_roadmap");
  }

  return planned;
}

export function runCopilotTool<T extends CopilotToolName>(
  name: T,
  inputs: CopilotToolInputs,
): CopilotToolResult<T> {
  switch (name) {
    case "admit_intelligence": {
      const input = inputs.admit_intelligence;
      if (!input) {
        throw new Error("admit_intelligence context is missing.");
      }
      return {
        name,
        output: buildUsAdmitIntelligence(input.input, input.school),
      } as CopilotToolResult<T>;
    }
    case "list_builder": {
      const input = inputs.list_builder;
      if (!input) {
        throw new Error("list_builder context is missing.");
      }
      return {
        name,
        output: generateList(input),
      } as CopilotToolResult<T>;
    }
    case "students_like_you": {
      const input = inputs.students_like_you;
      if (!input) {
        throw new Error("students_like_you context is missing.");
      }
      return {
        name,
        output: studentsLikeYouResponse(input),
      } as CopilotToolResult<T>;
    }
    case "climb_roadmap": {
      const input = inputs.climb_roadmap;
      if (!input) {
        throw new Error("climb_roadmap context is missing.");
      }
      return {
        name,
        output: buildClimbRoadmap(input.profile, input.schools),
      } as CopilotToolResult<T>;
    }
    case "command_center": {
      const input = inputs.command_center;
      if (!input) {
        throw new Error("command_center context is missing.");
      }
      return {
        name,
        output: assembleCommandCenter(input),
      } as CopilotToolResult<T>;
    }
    case "major_compass": {
      const input = inputs.major_compass;
      if (!input) {
        throw new Error("major_compass context is missing.");
      }
      return {
        name,
        output: generateCompass(input),
      } as CopilotToolResult<T>;
    }
    case "update_command_center_status": {
      const input = inputs.update_command_center_status;
      if (!input) {
        throw new Error("update_command_center_status context is missing.");
      }
      return {
        name,
        output: {
          type: "requirement_status",
          requirement_key: input.requirement_key,
          status: input.status,
          reversible: true,
        },
      } as CopilotToolResult<T>;
    }
  }
}

export function availableTools(
  planned: CopilotToolName[],
  inputs: CopilotToolInputs,
) {
  return planned.filter((name) => {
    if (name === "admit_intelligence") return Boolean(inputs.admit_intelligence);
    if (name === "list_builder") return Boolean(inputs.list_builder);
    if (name === "students_like_you") return Boolean(inputs.students_like_you);
    if (name === "climb_roadmap") return Boolean(inputs.climb_roadmap);
    if (name === "command_center") return Boolean(inputs.command_center);
    if (name === "major_compass") return Boolean(inputs.major_compass);
    if (name === "update_command_center_status") {
      return Boolean(inputs.update_command_center_status);
    }
    return false;
  });
}

export function answerFromToolResults(input: {
  message: string;
  results: CopilotToolResult[];
}) {
  if (isMoneyQuestion(input.message)) {
    return COPILOT_NO_MONEY_MESSAGE;
  }

  const lines: string[] = [];

  for (const result of input.results) {
    if (result.name === "admit_intelligence") {
      const output = result.output as UsAdmitIntelligence;
      lines.push(
        `Admit Intelligence reads this as ${output.tier} with score ${output.score} and confidence ${output.confidence}.`,
      );
    }

    if (result.name === "students_like_you") {
      const output = result.output as StudentsLikeYouResponse;
      const cohort = output.cohorts[0];
      if (!cohort) {
        lines.push("Students-Like-You did not clear the privacy floor for a cohort.");
      } else {
        lines.push(
          `Students-Like-You found ${cohort.cohort_size} similar records at ${cohort.school_name}: ${cohort.outcomes.admitted} admitted, ${cohort.outcomes.denied} denied, ${cohort.outcomes.waitlisted} waitlisted.`,
        );
      }
    }

    if (result.name === "climb_roadmap") {
      const output = result.output as ClimbRoadmap;
      const move = output.ranked_moves[0];
      if (!move) {
        lines.push("Climb Roadmap found no model-visible move for the loaded schools.");
      } else {
        lines.push(
          `Climb Roadmap puts ${move.lever.label} first for ${move.school.name}: ${move.before.score} to ${move.after.score}, delta ${move.delta_score}.`,
        );
      }
    }

    if (result.name === "command_center") {
      const output = result.output as CommandCenterPlan;
      lines.push(
        `Command Center shows ${output.progress.done} of ${output.progress.total} tasks complete, with progress ${output.progress.percent}.`,
      );
    }

    if (result.name === "list_builder") {
      const output = result.output as GeneratedList;
      const first = output.list[0];
      if (first) {
        const fitText = first.fit === null ? "fit unscored" : `fit ${first.fit}`;
        lines.push(
          `List Builder starts with ${first.name}: ${first.tier}, ${first.bucket}, ${fitText}.`,
        );
      } else {
        lines.push("List Builder returned no supported schools for this profile.");
      }
    }

    if (result.name === "major_compass") {
      const output = result.output as CompassResult;
      const major = output.majors[0];
      if (major) {
        const fitText = major.fit === null ? "fit unscored" : `fit ${major.fit}`;
        lines.push(`Major/Career Compass starts with ${major.major_name}: ${fitText}.`);
      } else {
        lines.push("Major/Career Compass has no sourced major rows loaded.");
      }
    }

    if (result.name === "update_command_center_status") {
      const output = result.output as CommandCenterActionReceipt;
      lines.push(
        `Command Center updated ${output.requirement_key} to ${output.status}.`,
      );
    }
  }

  if (lines.length === 0) {
    return "I need a loaded school or module context before I can give a grounded answer.";
  }

  return lines.join(" ");
}

export type CopilotProfileContext = {
  intended_major?: string;
  application_round?: "regular" | "early";
  interests?: string;
};

// The Copilot system prompt — pure, so the audit and tests can read it verbatim.
// Encodes the answer contract (specific, grounded, cites modules, one next step)
// and the hard guards (no numbers, no money, no PII, no "honest"/"confident").
export function buildCopilotSystemPrompt(): string {
  return [
    "You are Admira Copilot, a college-application advisor helping one student plan their applications.",
    "Write like a sharp, warm human advisor: plain, specific, and useful. Two to four short sentences.",
    "Use the MODULE FINDINGS provided to answer the student's actual question directly. Name the Admira module each fact came from (Admit Intelligence, Smart List, Students Like You, Climb, Command Center, Major Compass) so the student knows where it is in the app.",
    "End with one concrete next step the student can take right now.",
    "Hard rules:",
    "- Do not restate or rephrase the question, and do not open with filler like 'Great question'. Get straight to the answer.",
    "- Do not hedge vaguely ('it depends', 'consider various factors'). Be concrete and grounded in the findings.",
    "- Do not write any numeral, percentage, currency, rank, score, count, or date. The app shows every number separately from server data; you add the qualitative reasoning around it.",
    "- Do not discuss cost, net price, merit aid, scholarships, tuition, affordability, or ROI.",
    "- Do not expose private identifiers or raw similar-student rows.",
    "- Do not use the words 'honest' or 'confident', and avoid chatbot cliches. No em dashes.",
  ].join("\n");
}

// The grounded user message: the question, a qualitative profile, and the
// number-free module findings digest. The model reasons over real data without
// ever being handed a figure to echo.
export function buildCopilotUserMessage(input: {
  message: string;
  results: CopilotToolResult[];
  profile?: CopilotProfileContext;
}): string {
  const facts = summarizeResultsForModel(input.results);
  const profileLines: string[] = [];
  if (input.profile?.intended_major) {
    profileLines.push(`- Intended major: ${input.profile.intended_major}`);
  }
  if (input.profile?.interests) {
    profileLines.push(`- Interests: ${input.profile.interests}`);
  }
  if (input.profile?.application_round) {
    profileLines.push(`- Application round: ${input.profile.application_round}`);
  }

  return [
    `STUDENT QUESTION: ${input.message}`,
    "",
    "STUDENT PROFILE:",
    profileLines.length > 0 ? profileLines.join("\n") : "- (not provided)",
    "",
    "MODULE FINDINGS (already computed from the student's real data; use these, never invent figures):",
    facts.length > 0
      ? facts.map((fact) => `- ${fact}`).join("\n")
      : "- (no module results available)",
    "",
    "Answer the question using these findings, cite the modules by name, and end with one concrete next step. No numbers.",
  ].join("\n");
}

// A qualitative, NUMBER-FREE digest of the tool results, fed to the model so its
// prose is specific and grounded (school names, tiers, lever labels, module
// names) without ever handing it a figure to echo. Every number the user sees
// still comes from the deterministic receipts in `answerFromToolResults`.
export function summarizeResultsForModel(results: CopilotToolResult[]): string[] {
  const facts: string[] = [];

  for (const result of results) {
    if (result.name === "admit_intelligence") {
      const output = result.output as UsAdmitIntelligence;
      facts.push(
        `Admit Intelligence rates your top school a ${output.tier} for your profile.`,
      );
    }

    if (result.name === "list_builder") {
      const output = result.output as GeneratedList;
      const first = output.list[0];
      facts.push(
        first
          ? `Smart List leads with ${first.name}, a ${first.tier} in your ${first.bucket} bucket.`
          : "Smart List has no supported schools for this profile yet.",
      );
    }

    if (result.name === "students_like_you") {
      const output = result.output as StudentsLikeYouResponse;
      const cohort = output.cohorts[0];
      facts.push(
        cohort
          ? `Students Like You found a privacy-safe cohort of similar applicants at ${cohort.school_name}.`
          : "Students Like You does not have a large-enough cohort to show yet.",
      );
    }

    if (result.name === "climb_roadmap") {
      const output = result.output as ClimbRoadmap;
      const move = output.ranked_moves[0];
      facts.push(
        move
          ? `Climb's top move is "${move.lever.label}" for ${move.school.name}.`
          : "Climb found no model-visible move for the loaded schools yet.",
      );
    }

    if (result.name === "command_center") {
      facts.push(
        "Command Center is tracking the requirements, tasks, and deadlines for your list.",
      );
    }

    if (result.name === "major_compass") {
      const output = result.output as CompassResult;
      const major = output.majors[0];
      facts.push(
        major
          ? `Major Compass's strongest match for your interests is ${major.major_name}.`
          : "Major Compass has no major rows loaded yet.",
      );
    }

    if (result.name === "update_command_center_status") {
      const output = result.output as CommandCenterActionReceipt;
      facts.push(
        `You just marked "${output.requirement_key}" as ${output.status} in Command Center.`,
      );
    }
  }

  return facts;
}

export function numericTokensFromText(text: string) {
  return (
    text.match(
      /(?:[$]\s*)?\b\d+(?:,\d{3})*(?:\.\d+)?(?:\s*%|\s*\/\s*\d+(?:\.\d+)?)?/g,
    ) ?? []
  ).map((token) => token.replace(/\s+/g, ""));
}

export function collectNumericTokens(value: unknown) {
  return new Set(numericTokensFromText(JSON.stringify(value)));
}

export function sanitizeModelText(text: string) {
  return text
    .replace(/\bphase\s+\d+\b/gi, "deferred phase")
    .replace(/[$]\s*\d+(?:,\d{3})*(?:\.\d+)?/g, "tool-only figure")
    .replace(/\b\d+(?:,\d{3})*(?:\.\d+)?(?:\s*%|\s*\/\s*\d+(?:\.\d+)?)?/g, "tool-only figure");
}

export function assertChatNumbersCameFromTools(input: {
  text: string;
  results: CopilotToolResult[];
}) {
  const allowed = collectNumericTokens(input.results.map((result) => result.output));
  const actual = numericTokensFromText(input.text);
  const unexpected = actual.filter((token) => !allowed.has(token));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected chat number(s): ${unexpected.join(", ")}`);
  }
}
