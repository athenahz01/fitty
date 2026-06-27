import type { AdmissionSystem, GradingBasis, TestPolicy } from "../types";

export type CommandCenterSchool = {
  unitid: number;
  name: string;
  country: "US" | "CA" | string | null;
  admission_system: AdmissionSystem | null;
};

export type CommandCenterProgramRequirement = {
  id: string;
  unitid: number;
  program_name: string;
  system: AdmissionSystem | null;
  cutoff_avg_low: number | null;
  cutoff_avg_high: number | null;
  cutoff_basis: GradingBasis | null;
  prerequisites: unknown;
  test_policy: TestPolicy | null;
  supplemental_app: boolean;
  broad_based_admission: boolean;
  source_url: string;
};

export type CommandCenterDeadline = {
  id: string;
  unitid: number;
  program_requirement_id: string | null;
  admission_system: AdmissionSystem | null;
  deadline_kind: "regular" | "early" | "priority" | "document" | "system";
  label: string;
  deadline_date: string;
  source_url: string;
  source_name: string | null;
};

export type CommandCenterRequirementStatus = {
  unitid: number;
  program_requirement_id: string | null;
  requirement_key: string;
  status: "todo" | "in_progress" | "done";
  source_url: string | null;
};

export type CommandCenterDocument = {
  id: string;
  unitid: number | null;
  requirement_key: string | null;
  file_name: string;
  content_type: string;
  size_bytes: number;
  status: "uploaded" | "deleted";
  created_at: string;
};

export type CommandCenterTask = {
  id: string;
  unitid: number;
  program_requirement_id: string | null;
  requirement_key: string;
  title: string;
  detail: string;
  category: "academic" | "testing" | "form" | "review" | "deadline" | "document";
  status: "todo" | "in_progress" | "done";
  due_date: string | null;
  source_url: string;
};

export type CommandCenterSchoolPlan = {
  school: CommandCenterSchool;
  tasks: CommandCenterTask[];
  deadline:
    | {
        status: "loaded";
        label: string;
        date: string;
        source_url: string;
      }
    | {
        status: "not_loaded";
        label: "Deadline not loaded";
      };
};

export type CommandCenterPlan = {
  progress: {
    total: number;
    done: number;
    percent: number;
  };
  schools: CommandCenterSchoolPlan[];
  documents: CommandCenterDocument[];
};

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCutoff(low: number | null, high: number | null, basis: string | null) {
  const suffix =
    basis === "percentage"
      ? "%"
      : basis === "cegep_r_score"
        ? " R-score"
        : basis === "gpa_4_0"
          ? " GPA"
          : "";

  if (low !== null && high !== null && low !== high) {
    return `${low}-${high}${suffix}`;
  }
  if (low !== null) {
    return `${low}${suffix}`;
  }
  if (high !== null) {
    return `${high}${suffix}`;
  }
  return "loaded cutoff";
}

function prerequisitesFrom(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }

  if (value && typeof value === "object") {
    return Object.values(value)
      .flatMap((item) => (Array.isArray(item) ? item : [item]))
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }

  return [];
}

function statusKey(status: CommandCenterRequirementStatus) {
  return `${status.unitid}:${status.requirement_key}`;
}

function deadlineSort(left: CommandCenterDeadline, right: CommandCenterDeadline) {
  return (
    left.deadline_date.localeCompare(right.deadline_date) ||
    left.deadline_kind.localeCompare(right.deadline_kind) ||
    left.id.localeCompare(right.id)
  );
}

function pickDeadline(
  school: CommandCenterSchool,
  program: CommandCenterProgramRequirement | null,
  deadlines: CommandCenterDeadline[],
) {
  return deadlines
    .filter((deadline) => deadline.unitid === school.unitid)
    .filter(
      (deadline) =>
        !deadline.program_requirement_id ||
        !program ||
        deadline.program_requirement_id === program.id,
    )
    .filter(
      (deadline) =>
        !deadline.admission_system ||
        !school.admission_system ||
        deadline.admission_system === school.admission_system,
    )
    .sort(deadlineSort)[0];
}

function taskFrom(
  params: Omit<CommandCenterTask, "id" | "status">,
  statusMap: Map<string, CommandCenterRequirementStatus>,
): CommandCenterTask {
  const status = statusMap.get(`${params.unitid}:${params.requirement_key}`);
  return {
    ...params,
    id: `${params.unitid}:${params.requirement_key}`,
    status: status?.status ?? "todo",
  };
}

function tasksForProgram(
  school: CommandCenterSchool,
  program: CommandCenterProgramRequirement,
  deadline: CommandCenterDeadline | undefined,
  statusMap: Map<string, CommandCenterRequirementStatus>,
) {
  const prefix = `${program.id}:${slug(program.program_name)}`;
  const sourceUrl = program.source_url;
  const tasks: CommandCenterTask[] = [];
  const cutoffLow = finiteNumber(program.cutoff_avg_low);
  const cutoffHigh = finiteNumber(program.cutoff_avg_high);

  if (cutoffLow !== null || cutoffHigh !== null) {
    tasks.push(
      taskFrom(
        {
          unitid: school.unitid,
          program_requirement_id: program.id,
          requirement_key: `${prefix}:academic-cutoff`,
          title: `Confirm ${program.program_name} academic threshold`,
          detail: `Loaded cutoff band: ${formatCutoff(cutoffLow, cutoffHigh, program.cutoff_basis)}.`,
          category: "academic",
          due_date: deadline?.deadline_date ?? null,
          source_url: sourceUrl,
        },
        statusMap,
      ),
    );
  }

  for (const prerequisite of prerequisitesFrom(program.prerequisites)) {
    tasks.push(
      taskFrom(
        {
          unitid: school.unitid,
          program_requirement_id: program.id,
          requirement_key: `${prefix}:prerequisite:${slug(prerequisite)}`,
          title: `Complete ${prerequisite}`,
          detail: `${program.program_name} lists this prerequisite.`,
          category: "academic",
          due_date: deadline?.deadline_date ?? null,
          source_url: sourceUrl,
        },
        statusMap,
      ),
    );
  }

  if (program.test_policy === "required") {
    tasks.push(
      taskFrom(
        {
          unitid: school.unitid,
          program_requirement_id: program.id,
          requirement_key: `${prefix}:testing`,
          title: "Submit required test scores",
          detail: `${program.program_name} has a loaded required-testing policy.`,
          category: "testing",
          due_date: deadline?.deadline_date ?? null,
          source_url: sourceUrl,
        },
        statusMap,
      ),
    );
  }

  if (program.supplemental_app) {
    tasks.push(
      taskFrom(
        {
          unitid: school.unitid,
          program_requirement_id: program.id,
          requirement_key: `${prefix}:supplemental-app`,
          title: "Complete supplemental application",
          detail: `${program.program_name} requires a supplemental application component.`,
          category: "form",
          due_date: deadline?.deadline_date ?? null,
          source_url: sourceUrl,
        },
        statusMap,
      ),
    );
  }

  if (program.broad_based_admission) {
    tasks.push(
      taskFrom(
        {
          unitid: school.unitid,
          program_requirement_id: program.id,
          requirement_key: `${prefix}:broad-based-review`,
          title: "Complete broad-based review materials",
          detail: `${program.program_name} uses a broad-based review process.`,
          category: "review",
          due_date: deadline?.deadline_date ?? null,
          source_url: sourceUrl,
        },
        statusMap,
      ),
    );
  }

  return tasks.sort((left, right) => left.requirement_key.localeCompare(right.requirement_key));
}

function deadlineTask(
  school: CommandCenterSchool,
  deadline: CommandCenterDeadline,
  statusMap: Map<string, CommandCenterRequirementStatus>,
) {
  return taskFrom(
    {
      unitid: school.unitid,
      program_requirement_id: deadline.program_requirement_id,
      requirement_key: `deadline:${deadline.id}`,
      title: deadline.label,
      detail: `Deadline loaded from ${deadline.source_name ?? deadline.source_url}.`,
      category: "deadline",
      due_date: deadline.deadline_date,
      source_url: deadline.source_url,
    },
    statusMap,
  );
}

export function assembleCommandCenter(input: {
  schools: CommandCenterSchool[];
  programRequirements: CommandCenterProgramRequirement[];
  deadlines: CommandCenterDeadline[];
  statuses?: CommandCenterRequirementStatus[];
  documents?: CommandCenterDocument[];
}): CommandCenterPlan {
  const statusMap = new Map((input.statuses ?? []).map((status) => [statusKey(status), status]));
  const schools = [...input.schools].sort((left, right) => left.unitid - right.unitid);
  const plans = schools.map((school) => {
    const programs = input.programRequirements
      .filter((program) => program.unitid === school.unitid)
      .sort((left, right) => left.program_name.localeCompare(right.program_name));
    const primaryProgram = programs[0] ?? null;
    const deadline = pickDeadline(school, primaryProgram, input.deadlines);
    const tasks = programs
      .flatMap((program) => tasksForProgram(school, program, deadline, statusMap))
      .concat(deadline ? [deadlineTask(school, deadline, statusMap)] : [])
      .sort((left, right) => left.requirement_key.localeCompare(right.requirement_key));

    return {
      school,
      tasks,
      deadline: deadline
        ? {
            status: "loaded" as const,
            label: deadline.label,
            date: deadline.deadline_date,
            source_url: deadline.source_url,
          }
        : {
            status: "not_loaded" as const,
            label: "Deadline not loaded" as const,
          },
    };
  });

  const allTasks = plans.flatMap((plan) => plan.tasks);
  const done = allTasks.filter((task) => task.status === "done").length;

  return {
    progress: {
      total: allTasks.length,
      done,
      percent: allTasks.length === 0 ? 0 : Math.round((done / allTasks.length) * 100),
    },
    schools: plans,
    documents: [...(input.documents ?? [])].sort((left, right) =>
      left.file_name.localeCompare(right.file_name),
    ),
  };
}
