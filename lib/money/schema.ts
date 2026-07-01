import { z } from "zod";

const optionalNumber = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    schema.optional(),
  );

export const moneyIncomeBandSchema = z.enum([
  "0-30000",
  "30001-48000",
  "48001-75000",
  "75001-110000",
  "110001-plus",
  "overall",
]);

export const moneyResidencySchema = z.enum([
  "any",
  "in_state",
  "out_of_state",
  "domestic",
  "international",
]);

export const moneyRequestSchema = z.object({
  unitid: z.number().int(),
  income_band: moneyIncomeBandSchema.default("overall"),
  residency: moneyResidencySchema.optional(),
  profile: z
    .object({
      gpa: optionalNumber(z.number().min(0).max(5)),
      sat_score: optionalNumber(z.number().int().min(400).max(1600)),
      act_score: optionalNumber(z.number().int().min(1).max(36)),
      canadian_average: optionalNumber(z.number().min(0).max(100)),
    })
    .default({}),
});

export type MoneyRequest = z.infer<typeof moneyRequestSchema>;

export function formatValidationError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}
