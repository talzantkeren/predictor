import { z } from "zod";

const timestampSchema = z.string().datetime({ offset: true });

function strictIntegerScore(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    return value;
  }
  return Number(value);
}

export const predictionScoreSchema = z.preprocess(
  strictIntegerScore,
  z
    .number({ invalid_type_error: "יש להזין מספר שלם בין 0 ל־30." })
    .int("יש להזין מספר שלם בין 0 ל־30.")
    .min(0, "מספר השערים אינו יכול להיות שלילי.")
    .max(30, "מספר השערים יכול להיות לכל היותר 30."),
);

export const savePredictionInputSchema = z.object({
  leagueId: z.string().uuid("מזהה הליגה אינו תקין."),
  matchId: z.string().uuid("מזהה המשחק אינו תקין."),
  predictedHomeScore: predictionScoreSchema,
  predictedAwayScore: predictionScoreSchema,
});

export const savedPredictionRpcSchema = z
  .object({
    prediction_id: z.string().uuid(),
    league_id: z.string().uuid(),
    match_id: z.string().uuid(),
    predicted_home_score: z.number().int().min(0).max(30),
    predicted_away_score: z.number().int().min(0).max(30),
    predicted_outcome: z.enum(["HOME", "DRAW", "AWAY"]),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .transform((prediction) => ({
    id: prediction.prediction_id,
    leagueId: prediction.league_id,
    matchId: prediction.match_id,
    predictedHomeScore: prediction.predicted_home_score,
    predictedAwayScore: prediction.predicted_away_score,
    predictedOutcome: prediction.predicted_outcome,
    createdAt: prediction.created_at,
    updatedAt: prediction.updated_at,
  }));

const dateFilterSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  },
  "התאריך אינו תקין.",
);

const roundFilterSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) {
      return Number(value);
    }
    return value;
  },
  z.number().int().min(1).max(100),
);

export function parseMatchListFilter(searchParams: {
  round?: string | string[];
  date?: string | string[];
}) {
  if (Array.isArray(searchParams.round) || Array.isArray(searchParams.date)) {
    return { success: false as const };
  }

  const round = Array.isArray(searchParams.round) ? undefined : searchParams.round;
  const date = Array.isArray(searchParams.date) ? undefined : searchParams.date;

  if (round && date) return { success: false as const };
  if (round) {
    const parsed = roundFilterSchema.safeParse(round);
    return parsed.success
      ? { success: true as const, data: { kind: "round" as const, round: parsed.data } }
      : { success: false as const };
  }
  if (date) {
    const parsed = dateFilterSchema.safeParse(date);
    return parsed.success
      ? { success: true as const, data: { kind: "date" as const, date: parsed.data } }
      : { success: false as const };
  }
  return { success: true as const, data: undefined };
}

export type PredictionFieldErrors = Record<string, string[] | undefined>;

export function getPredictionFieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as PredictionFieldErrors;
}
