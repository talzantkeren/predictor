import { z } from "zod";

function optionalStrictIntegerScore(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    return value;
  }
  return Number(value);
}

const optionalScoreSchema = z.preprocess(
  optionalStrictIntegerScore,
  z
    .number({ invalid_type_error: "יש להזין מספר שלם בין 0 ל־30." })
    .int("יש להזין מספר שלם בין 0 ל־30.")
    .min(0, "מספר השערים אינו יכול להיות שלילי.")
    .max(30, "מספר השערים יכול להיות לכל היותר 30.")
    .optional(),
);

export const manualResultInputSchema = z
  .object({
    matchId: z.string().uuid("מזהה המשחק אינו תקין."),
    status: z.enum(["finished", "canceled"], {
      required_error: "יש לבחור מצב תוצאה.",
      invalid_type_error: "מצב התוצאה אינו תקין.",
    }),
    homeScore: optionalScoreSchema,
    awayScore: optionalScoreSchema,
  })
  .superRefine((input, context) => {
    if (input.status === "finished") {
      if (input.homeScore === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["homeScore"],
          message: "יש להזין את מספר שערי קבוצת הבית.",
        });
      }
      if (input.awayScore === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["awayScore"],
          message: "יש להזין את מספר שערי קבוצת החוץ.",
        });
      }
      return;
    }

    if (input.homeScore !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["homeScore"],
        message: "במשחק מבוטל אין להזין תוצאה.",
      });
    }
    if (input.awayScore !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["awayScore"],
        message: "במשחק מבוטל אין להזין תוצאה.",
      });
    }
  })
  .transform((input) =>
    input.status === "finished"
      ? {
          matchId: input.matchId,
          status: input.status,
          homeScore: input.homeScore as number,
          awayScore: input.awayScore as number,
        }
      : {
          matchId: input.matchId,
          status: input.status,
          homeScore: null,
          awayScore: null,
        },
  );

export type ManualResultInput = z.infer<typeof manualResultInputSchema>;
export type ManualResultFieldErrors = Record<string, string[] | undefined>;

export function getManualResultFieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as ManualResultFieldErrors;
}
