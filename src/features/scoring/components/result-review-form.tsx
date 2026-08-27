"use client";

import { useActionState } from "react";

import { FormMessage } from "@/features/auth/components/form-message";
import type { LifecycleDecisionActionState } from "@/features/scoring/lifecycle-decision-action-state";

type ReviewAction = (
  previousState: LifecycleDecisionActionState,
  formData: FormData,
) => Promise<LifecycleDecisionActionState>;

const initialState: LifecycleDecisionActionState = { status: "idle" };

export function ResultReviewForm({
  action,
  matchId,
}: {
  action: ReviewAction;
  matchId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const homeErrorId = `review-home-error-${matchId}`;
  const awayErrorId = `review-away-error-${matchId}`;

  return (
    <form action={formAction} className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <fieldset disabled={pending}>
        <legend className="font-bold text-amber-950">הכרעת תוצאת זמן חוקי</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-semibold text-amber-950">
            הכרעה
            <select
              name="selectedStatus"
              defaultValue="finished"
              className="mt-1 min-h-11 w-full rounded-lg border border-amber-400 bg-white px-3 py-2"
            >
              <option value="finished">הסתיים בזמן חוקי</option>
              <option value="canceled">בוטל</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-amber-950">
            תוצאת בית
            <input
              name="selectedHomeScore"
              type="number"
              min="0"
              max="30"
              inputMode="numeric"
              aria-describedby={homeErrorId}
              className="mt-1 min-h-11 w-full rounded-lg border border-amber-400 bg-white px-3 py-2"
            />
            <span id={homeErrorId} className="mt-1 block text-xs text-red-800">
              {state.fieldErrors?.selectedHomeScore?.[0]}
            </span>
          </label>
          <label className="text-sm font-semibold text-amber-950">
            תוצאת חוץ
            <input
              name="selectedAwayScore"
              type="number"
              min="0"
              max="30"
              inputMode="numeric"
              aria-describedby={awayErrorId}
              className="mt-1 min-h-11 w-full rounded-lg border border-amber-400 bg-white px-3 py-2"
            />
            <span id={awayErrorId} className="mt-1 block text-xs text-red-800">
              {state.fieldErrors?.selectedAwayScore?.[0]}
            </span>
          </label>
        </div>
        {state.message ? (
          <div className="mt-3">
            <FormMessage kind={state.status === "error" ? "error" : "success"}>
              {state.message}
            </FormMessage>
          </div>
        ) : null}
        <button
          type="submit"
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-amber-900 px-4 py-2 font-bold text-white hover:bg-amber-950 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
        >
          {pending ? "שומר הכרעה…" : "אישור הכרעת התוצאה"}
        </button>
      </fieldset>
    </form>
  );
}
