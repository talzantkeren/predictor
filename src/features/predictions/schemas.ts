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

const matchStatusSchema = z.enum([
  "scheduled",
  "live",
  "finished",
  "postponed",
  "canceled",
]);

const leagueStatusSchema = z.enum([
  "draft",
  "open",
  "active",
  "completed",
  "archived",
]);

const matchContextFields = {
  match_id: z.string().uuid(),
  round_number: z.number().int().min(1).max(32_767),
  kickoff_at: timestampSchema,
  predictions_locked_at: timestampSchema.nullable(),
  match_status: matchStatusSchema,
  provider_status: z.string().max(64).nullable(),
  home_score: z.number().int().min(0).max(30).nullable(),
  away_score: z.number().int().min(0).max(30).nullable(),
  home_team_id: z.string().uuid(),
  home_team_name: z.string().min(1).max(100),
  home_team_short_name: z.string().min(1).max(30).nullable(),
  away_team_id: z.string().uuid(),
  away_team_name: z.string().min(1).max(100),
  away_team_short_name: z.string().min(1).max(30).nullable(),
  database_time: timestampSchema,
};

export const matchSelectionContextRpcSchema = z
  .array(z.object(matchContextFields).strict())
  .max(1);

export const matchDetailContextRpcSchema = z
  .array(
    z
      .object({
        league_id: z.string().uuid(),
        league_name: z.string().min(1).max(80),
        league_status: leagueStatusSchema,
        ...matchContextFields,
        own_prediction_id: z.string().uuid().nullable(),
        own_predicted_home_score: z.number().int().min(0).max(30).nullable(),
        own_predicted_away_score: z.number().int().min(0).max(30).nullable(),
        own_predicted_outcome: z.enum(["HOME", "DRAW", "AWAY"]).nullable(),
        own_prediction_created_at: timestampSchema.nullable(),
        own_prediction_updated_at: timestampSchema.nullable(),
      })
      .strict()
      .superRefine((row, context) => {
        const predictionFields = [
          row.own_predicted_home_score,
          row.own_predicted_away_score,
          row.own_predicted_outcome,
          row.own_prediction_created_at,
          row.own_prediction_updated_at,
        ];
        const hasCompletePrediction = predictionFields.every(
          (value) => value !== null,
        );
        const hasNoPrediction = predictionFields.every(
          (value) => value === null,
        );

        if (
          (row.own_prediction_id === null && !hasNoPrediction) ||
          (row.own_prediction_id !== null && !hasCompletePrediction)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Own prediction fields are inconsistent.",
          });
        }
      }),
  )
  .max(1);

const eligibleLeaguePageRowSchema = z
  .object({
    league_id: z.string().uuid(),
    league_name: z.string().min(1).max(80),
    league_status: leagueStatusSchema,
    league_created_at: timestampSchema,
  })
  .strict();

export const eligibleLeaguePageRpcSchema = z
  .array(eligibleLeaguePageRowSchema)
  .max(21);

const revealedPredictionPageRowSchema = z
  .object({
    prediction_id: z.string().uuid(),
    user_id: z.string().uuid(),
    display_name: z.string().min(1).max(80),
    predicted_home_score: z.number().int().min(0).max(30),
    predicted_away_score: z.number().int().min(0).max(30),
    predicted_outcome: z.enum(["HOME", "DRAW", "AWAY"]),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict();

export const revealedPredictionPageRpcSchema = z
  .array(revealedPredictionPageRowSchema)
  .max(26);

export type MatchContextRpcRow = z.infer<
  typeof matchSelectionContextRpcSchema
>[number];
export type MatchDetailContextRpcRow = z.infer<
  typeof matchDetailContextRpcSchema
>[number];

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
