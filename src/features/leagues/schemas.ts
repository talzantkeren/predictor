import { z } from "zod";

const MAX_DATABASE_INTEGER = 2_147_483_647;
const paymentLinkPattern = /(?:https?:\/\/|www\.)/i;

function trimmedText(minimum: number, maximum: number, messages: {
  minimum: string;
  maximum: string;
}) {
  return z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(minimum, messages.minimum)
        .max(maximum, messages.maximum),
    );
}

function optionalTrimmedText(maximum: number, maximumMessage: string) {
  return z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(maximum, maximumMessage))
    .transform((value) => (value.length === 0 ? undefined : value));
}

function integerString(
  minimum: number,
  maximum: number,
  invalidMessage: string,
) {
  return z
    .string()
    .trim()
    .regex(/^\d+$/, invalidMessage)
    .transform((value) => Number(value))
    .refine(
      (value) =>
        Number.isSafeInteger(value) && value >= minimum && value <= maximum,
      invalidMessage,
    );
}

export function percentageToBps(value: string) {
  const normalized = value.trim();
  const match = /^(0|[1-9]\d{0,2})(?:\.(\d{1,2}))?$/.exec(normalized);

  if (!match) {
    return null;
  }

  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const basisPoints = whole * 100 + fraction;

  if (basisPoints < 1 || basisPoints > 10_000) {
    return null;
  }

  return basisPoints;
}

const percentageSchema = z.string().transform((value, context) => {
  const basisPoints = percentageToBps(value);

  if (basisPoints === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "יש להזין אחוז חיובי עד 100, עם עד שתי ספרות אחרי הנקודה.",
    });
    return z.NEVER;
  }

  return basisPoints;
});

export const leagueNameSchema = trimmedText(3, 80, {
  minimum: "שם הליגה חייב לכלול לפחות 3 תווים.",
  maximum: "שם הליגה יכול לכלול עד 80 תווים.",
});

export const leagueDescriptionSchema = optionalTrimmedText(
  500,
  "התיאור יכול לכלול עד 500 תווים.",
);

export const demoEntryFeeAgorotSchema = integerString(
  0,
  MAX_DATABASE_INTEGER,
  "יש להזין סכום Demo שלם ולא־שלילי באגורות.",
);

export const scoringRulesSchema = z
  .object({
    exactPoints: integerString(
      0,
      100,
      "ניקוד לתוצאה מדויקת חייב להיות מספר שלם בין 0 ל־100.",
    ),
    correctOutcomePoints: integerString(
      0,
      100,
      "ניקוד לכיוון נכון חייב להיות מספר שלם בין 0 ל־100.",
    ),
    incorrectPoints: integerString(
      0,
      100,
      "ניקוד לכיוון שגוי חייב להיות מספר שלם בין 0 ל־100.",
    ),
  })
  .superRefine((rules, context) => {
    if (rules.exactPoints < rules.correctOutcomePoints) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exactPoints"],
        message: "ניקוד לתוצאה מדויקת חייב להיות לפחות כמו ניקוד לכיוון נכון.",
      });
    }

    if (rules.correctOutcomePoints < rules.incorrectPoints) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correctOutcomePoints"],
        message: "ניקוד לכיוון נכון חייב להיות לפחות כמו ניקוד לכיוון שגוי.",
      });
    }
  });

export const prizeRulesSchema = z
  .array(
    z.object({
      position: integerString(
        1,
        100,
        "המיקום חייב להיות מספר שלם וחיובי.",
      ),
      percentageBps: percentageSchema,
    }),
  )
  .min(1, "יש להגדיר לפחות מיקום פרס אחד.")
  .max(100, "ניתן להגדיר עד 100 מיקומי פרס.")
  .superRefine((prizes, context) => {
    const positions = prizes.map((prize) => prize.position);
    const uniquePositions = new Set(positions);

    if (uniquePositions.size !== positions.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "כל מיקום פרס חייב להופיע פעם אחת בלבד.",
      });
    }

    const sortedPositions = [...uniquePositions].sort((left, right) => left - right);
    const positionsAreConsecutive = sortedPositions.every(
      (position, index) => position === index + 1,
    );

    if (!positionsAreConsecutive) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "מיקומי הפרסים חייבים להיות רצופים ולהתחיל במקום 1.",
      });
    }

    const total = prizes.reduce(
      (sum, prize) => sum + prize.percentageBps,
      0,
    );

    if (total !== 10_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "סך חלוקת הפרסים חייב להיות 100% בדיוק.",
      });
    }
  });

export const createLeagueSchema = z.object({
  name: leagueNameSchema,
  description: leagueDescriptionSchema,
  seasonId: z.string().uuid("יש לבחור עונה תקינה."),
  demoEntryFeeAgorot: demoEntryFeeAgorotSchema,
  demoPaymentInstructions: optionalTrimmedText(
    500,
    "הוראות ה־Demo יכולות לכלול עד 500 תווים.",
  ).refine(
    (value) => value === undefined || !paymentLinkPattern.test(value),
    "אין להזין קישור תשלום. מצב הקורס הוא Demo בלבד.",
  ),
  allowLateJoin: z.boolean(),
  scoring: scoringRulesSchema,
  prizes: prizeRulesSchema,
});

export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;

export type LeagueFieldErrors = Record<string, string[] | undefined>;

export function getLeagueFieldErrors(error: z.ZodError): LeagueFieldErrors {
  const fieldErrors: LeagueFieldErrors = {};

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "form";
    fieldErrors[path] = [...(fieldErrors[path] ?? []), issue.message];
  }

  return fieldErrors;
}
