import { z } from "zod";

export const commandCenterRequestSchema = z.object({
  schools: z
    .array(
      z.object({
        unitid: z.number().int(),
        program_name: z.string().trim().max(180).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export const requirementStatusUpdateSchema = z.object({
  unitid: z.number().int(),
  program_requirement_id: z.string().uuid().nullable().optional(),
  requirement_key: z.string().trim().min(1).max(240),
  status: z.enum(["todo", "in_progress", "done"]),
  source_url: z.string().url().nullable().optional(),
});

export function formatValidationError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}
