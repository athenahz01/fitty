import { z } from "zod";

const optionalNumber = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === null ? undefined : value), schema.optional());

export const climbProfileSchema = z.object({
  sat_score: optionalNumber(z.number().int().min(400).max(1600)),
  act_score: optionalNumber(z.number().int().min(1).max(36)),
  gpa: optionalNumber(z.number().min(0).max(5)),
  application_round: z.enum(["regular", "early"]).default("regular"),
  intended_major: z.string().trim().max(160).optional(),
  activity_context: z.string().trim().max(800).optional(),
});

export const climbRequestSchema = z.object({
  profile: climbProfileSchema,
  schools: z
    .array(
      z.object({
        unitid: z.number().int(),
      }),
    )
    .min(1)
    .max(12),
});

export type ClimbProfileInput = z.infer<typeof climbProfileSchema>;
export type ClimbRequestInput = z.infer<typeof climbRequestSchema>;

export function formatValidationError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}
