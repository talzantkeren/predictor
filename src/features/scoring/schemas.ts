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

function strictPositiveInteger(value: unknown) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return value;
  return Number(value);
}

const manualMatchRoundSchema = z.preprocess(
  strictPositiveInteger,
  z
    .number({ invalid_type_error: "יש להזין מספר מחזור שלם." })
    .int("יש להזין מספר מחזור שלם.")
    .min(1, "מספר המחזור חייב להיות חיובי.")
    .max(1000, "מספר המחזור יכול להיות לכל היותר 1000."),
);

const utcMinutePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const storedUtcInstantPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|\+00(?::?00)?)$/;

function hasExactUtcCalendarComponents(value: string) {
  const components = utcMinutePattern.exec(value) ?? storedUtcInstantPattern.exec(value);
  if (!components) return false;

  const [, year, month, day, hour, minute, second = "0"] = components;
  if (Number(year) < 1) return false;
  const parsed = Date.parse(
    utcMinutePattern.test(value) ? `${value}:00.000Z` : value,
  );
  if (!Number.isFinite(parsed)) return false;
  const date = new Date(parsed);
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day) &&
    date.getUTCHours() === Number(hour) &&
    date.getUTCMinutes() === Number(minute) &&
    date.getUTCSeconds() === Number(second)
  );
}

const utcKickoffSchema = z
  .string({ required_error: "יש להזין מועד פתיחה ב־UTC." })
  .refine(hasExactUtcCalendarComponents, {
    message: "יש להזין תאריך ושעה תקינים ב־UTC.",
  })
  .transform((value) =>
    utcMinutePattern.test(value) ? `${value}:00.000Z` : value,
  );

export const manualMatchInputSchema = z
  .object({
    operation: z.enum(["create", "correct"]),
    matchId: z.string().uuid("מזהה המשחק אינו תקין."),
    seasonId: z.string().uuid("יש לבחור עונה קיימת."),
    homeTeamId: z.string().uuid("יש לבחור קבוצת בית קיימת."),
    awayTeamId: z.string().uuid("יש לבחור קבוצת חוץ קיימת."),
    roundNumber: manualMatchRoundSchema,
    kickoffAt: utcKickoffSchema,
    status: z.enum(
      ["scheduled", "live", "finished", "postponed", "canceled"],
      { invalid_type_error: "מצב המשחק אינו תקין." },
    ),
    homeScore: optionalScoreSchema,
    awayScore: optionalScoreSchema,
  })
  .superRefine((input, context) => {
    if (input.homeTeamId === input.awayTeamId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["awayTeamId"],
        message: "קבוצת הבית וקבוצת החוץ חייבות להיות שונות.",
      });
    }

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

    for (const field of ["homeScore", "awayScore"] as const) {
      if (input[field] !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "מותר להזין תוצאה רק למשחק שהסתיים.",
        });
      }
    }
  })
  .transform((input) => ({
    ...input,
    homeScore: input.status === "finished" ? (input.homeScore as number) : null,
    awayScore: input.status === "finished" ? (input.awayScore as number) : null,
  }));

export type ManualMatchInput = z.infer<typeof manualMatchInputSchema>;
export type ManualMatchFieldErrors = Record<string, string[] | undefined>;

export function getManualMatchFieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as ManualMatchFieldErrors;
}

export const manualOverrideClearConfirmationSchema = z.object({
  confirmation: z.literal("CONFIRM_PROVIDER_HANDOFF", {
    errorMap: () => ({
      message: "יש לאשר במפורש את החזרת הבעלות לספק.",
    }),
  }),
});

const systemMatchStatusFilterSchema = z.enum([
  "scheduled",
  "live",
  "finished",
  "postponed",
  "canceled",
]);

function normalizeExactEmpty(value: unknown) {
  return value === "" ? undefined : value;
}

export function parseSystemMatchFilters(searchParams: {
  season?: string | string[];
  status?: string | string[];
  round?: string | string[];
}):
  | {
      success: true;
      data: {
        seasonId?: string;
        status?: z.infer<typeof systemMatchStatusFilterSchema>;
        roundNumber?: number;
      };
    }
  | { success: false } {
  if (
    Array.isArray(searchParams.season) ||
    Array.isArray(searchParams.status) ||
    Array.isArray(searchParams.round)
  ) {
    return { success: false };
  }

  const season = z
    .string()
    .uuid()
    .optional()
    .safeParse(normalizeExactEmpty(searchParams.season));
  const status = systemMatchStatusFilterSchema
    .optional()
    .safeParse(normalizeExactEmpty(searchParams.status));
  const round = z
    .preprocess(
      (value) => {
        const normalized = normalizeExactEmpty(value);
        return typeof normalized === "string" && /^[1-9][0-9]*$/.test(normalized)
          ? Number(normalized)
          : normalized;
      },
      z.number().int().min(1).max(100).optional(),
    )
    .safeParse(searchParams.round);

  if (!season.success || !status.success || !round.success) {
    return { success: false };
  }

  return {
    success: true,
    data: {
      seasonId: season.data,
      status: status.data,
      roundNumber: round.data,
    },
  };
}
