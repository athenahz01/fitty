import { z } from "zod";

export const narrativeRequestSchema = z
  .object({
    essay_type: z.enum(["personal_statement", "supplement", "activity_list"]),
    essay_text: z.preprocess(
      (value) => (typeof value === "string" ? value : ""),
      z.string().trim().max(8000),
    ),
    activities: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
    school: z
      .object({
        unitid: z.number().int(),
        name: z.string().trim().min(1).max(180),
        c7_factors: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.essay_type === "activity_list") {
      if (!value.activities || value.activities.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["activities"],
          message: "Provide at least one activity entry to review.",
        });
      }
    } else if (value.essay_text.length < 40) {
      context.addIssue({
        code: "custom",
        path: ["essay_text"],
        message: "Paste at least a paragraph of your own draft to review.",
      });
    }
  });

export type NarrativeRequestInput = z.infer<typeof narrativeRequestSchema>;

export function formatValidationError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}
