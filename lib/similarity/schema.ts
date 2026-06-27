import { z } from "zod";

const optionalNumber = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    schema.optional(),
  );

export const studentsLikeYouProfileSchema = z
  .object({
    cycle_year: optionalNumber(z.number().int().min(2020).max(2100)),
    gpa: optionalNumber(z.number().min(0).max(5)),
    sat_score: optionalNumber(z.number().int().min(400).max(1600)),
    act_score: optionalNumber(z.number().int().min(1).max(36)),
    test_submitted: z.boolean().default(true),
    course_rigor: z
      .enum(["standard", "honors", "ap_ib_dual", "most_rigorous", "unknown"])
      .default("unknown"),
    activities_tier: z
      .enum(["none", "school", "regional", "state", "national", "unknown"])
      .default("unknown"),
    intended_major: z.string().trim().max(120).optional(),
    application_round: z.enum(["regular", "early"]).default("regular"),
    demonstrated_interest: z
      .enum(["none", "light", "moderate", "strong", "unknown"])
      .default("unknown"),
  })
  .strict();

export const studentsLikeYouRequestSchema = z
  .object({
    unitid: z.number().int().optional(),
    profile: studentsLikeYouProfileSchema,
  })
  .strict();

export type StudentsLikeYouProfileInput = z.infer<
  typeof studentsLikeYouProfileSchema
>;
export type StudentsLikeYouRequest = z.infer<typeof studentsLikeYouRequestSchema>;

export function formatValidationError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}
