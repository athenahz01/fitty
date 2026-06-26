import { z } from "zod";

const optionalNumber = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    schema.optional(),
  );

const optionalText = (maxLength: number) =>
  z.preprocess((value) => {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().max(maxLength).optional());

const profileSchema = z.object({
  sat_score: optionalNumber(z.number().int().min(400).max(1600)),
  act_score: optionalNumber(z.number().int().min(1).max(36)),
  gpa: optionalNumber(z.number().min(0).max(5)),
  application_round: z.enum(["regular", "early"]).default("regular"),
});

const shapeSchema = z.object({
  reach: z.number().int().min(0).max(20),
  target: z.number().int().min(0).max(20),
  safety: z.number().int().min(0).max(20),
});

const preferencesSchema = z.object({
  intended_major: optionalText(160),
  interests: optionalText(800),
  budget: optionalNumber(z.number().min(0).max(200000)),
  shape: shapeSchema.optional(),
});

export const listRequestSchema = z.object({
  profile: profileSchema.default({ application_round: "regular" }),
  preferences: preferencesSchema.default({}),
});

export type ListRequest = z.infer<typeof listRequestSchema>;

export function formatValidationError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}
