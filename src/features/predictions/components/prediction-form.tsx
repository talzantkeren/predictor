"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { FieldError, FormMessage } from "@/features/auth/components/form-message";
import {
  savePredictionAction,
  type PredictionActionState,
} from "@/features/predictions/actions";
import type { OwnPrediction } from "@/features/predictions/types";

const initialState: PredictionActionState = { status: "idle" };

export function PredictionForm({
  leagueId,
  matchId,
  homeTeamName,
  awayTeamName,
  prediction,
}: {
  leagueId: string;
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  prediction: OwnPrediction | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    savePredictionAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="matchId" value={matchId} />

      <fieldset>
        <legend className="text-lg font-black text-ink">ניחוש תוצאה מדויקת</legend>
        <p className="mt-1 text-sm leading-6 text-ink-secondary">
          אפשר לשמור שוב כדי להחליף את הניחוש כל עוד מסד הנתונים טרם נעל את המשחק.
        </p>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 sm:gap-5">
          <div className="min-w-0">
            <label
              htmlFor={`prediction-home-${matchId}`}
              className="block break-words text-sm font-bold text-ink"
            >
              שערים — {homeTeamName}
            </label>
            <input
              id={`prediction-home-${matchId}`}
              name="predictedHomeScore"
              type="number"
              inputMode="numeric"
              min={0}
              max={30}
              step={1}
              required
              defaultValue={prediction?.predictedHomeScore ?? ""}
              aria-invalid={Boolean(state.fieldErrors?.predictedHomeScore)}
              aria-describedby={
                state.fieldErrors?.predictedHomeScore
                  ? `prediction-home-${matchId}-error`
                  : undefined
              }
              className="tabular-nums mt-2 min-h-14 w-full rounded-lg border border-control-border bg-white px-3 py-3 text-center text-xl font-black text-ink outline-none focus:border-focus"
            />
            <FieldError
              id={`prediction-home-${matchId}-error`}
              messages={state.fieldErrors?.predictedHomeScore}
            />
          </div>

          <span aria-hidden="true" className="mt-11 text-xl font-black text-ink-muted">
            –
          </span>

          <div className="min-w-0">
            <label
              htmlFor={`prediction-away-${matchId}`}
              className="block break-words text-sm font-bold text-ink"
            >
              שערים — {awayTeamName}
            </label>
            <input
              id={`prediction-away-${matchId}`}
              name="predictedAwayScore"
              type="number"
              inputMode="numeric"
              min={0}
              max={30}
              step={1}
              required
              defaultValue={prediction?.predictedAwayScore ?? ""}
              aria-invalid={Boolean(state.fieldErrors?.predictedAwayScore)}
              aria-describedby={
                state.fieldErrors?.predictedAwayScore
                  ? `prediction-away-${matchId}-error`
                  : undefined
              }
              className="tabular-nums mt-2 min-h-14 w-full rounded-lg border border-control-border bg-white px-3 py-3 text-center text-xl font-black text-ink outline-none focus:border-focus"
            />
            <FieldError
              id={`prediction-away-${matchId}-error`}
              messages={state.fieldErrors?.predictedAwayScore}
            />
          </div>
        </div>
      </fieldset>

      {state.message ? (
        <FormMessage kind={state.status === "success" ? "success" : "error"}>
          {state.message}
        </FormMessage>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-lg bg-action px-5 py-3 font-extrabold text-white transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60 sm:w-auto"
      >
        {pending
          ? "שומרים..."
          : prediction
            ? "עדכון הניחוש"
            : "שמירת הניחוש"}
      </button>
    </form>
  );
}
