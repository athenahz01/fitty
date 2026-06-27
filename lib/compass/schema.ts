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

export const compassRequestSchema = z.object({
  interests: optionalText(400),
  unitid: optionalNumber(z.number().int()),
  profile: z
    .object({
      sat_score: optionalNumber(z.number().int().min(400).max(1600)),
      act_score: optionalNumber(z.number().int().min(1).max(36)),
      gpa: optionalNumber(z.number().min(0).max(5)),
      application_round: z.enum(["regular", "early"]).default("regular"),
    })
    .optional(),
});

export type CompassRequest = z.infer<typeof compassRequestSchema>;

export function formatValidationError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}
