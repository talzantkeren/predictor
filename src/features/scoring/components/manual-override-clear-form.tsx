"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import type {
  ManualOverrideClearActionState,
  ManualOverrideClearFormAction,
} from "@/features/scoring/manual-override-clear-action-state";

const initialState: ManualOverrideClearActionState = { status: "idle" };

export function ManualOverrideClearForm({
  action,
  externalProvider,
  isManuallyOverridden,
  observedMatchId,
}: {
  action: ManualOverrideClearFormAction;
  externalProvider: string | null;
  isManuallyOverridden: boolean;
  observedMatchId: string;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialState);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const prefix = `clear-manual-override-${observedMatchId}`;
  const providerOwned = externalProvider === "api-football";

  useEffect(() => {
    if (state.status === "error" && state.confirmationError) {
      confirmationRef.current?.focus();
    }
  }, [state.confirmationError, state.status]);

  if (!providerOwned) {
    return isManuallyOverridden ? (
      <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
        למשחק זה אין זהות ספק חיצונית. הוא נשאר במסלול הידני, ולכן אין ספק
        שאליו ניתן להחזיר בעלות.
      </p>
    ) : null;
  }

  if (!isManuallyOverridden) {
    return (
      <p
        role={state.status === "success" ? "status" : undefined}
        className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-950"
      >
        {state.status === "success" && state.message
          ? state.message
          : "בעלות הספק פעילה. רק עדכון API-Football מאומת רשאי לשנות את נתוני המשחק."}
      </p>
    );
  }

  return (
    <form
      action={formAction}
      data-manual-override-clear-match-id={observedMatchId}
      className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4"
      aria-labelledby={`${prefix}-title`}
    >
      <h3 id={`${prefix}-title`} className="text-base font-extrabold text-amber-950">
        החזרת בעלות ל־API-Football
      </h3>
      <p id={`${prefix}-description`} className="mt-1 text-sm leading-6 text-amber-950">
        הפעולה מסירה רק את סימון הבעלות הידנית. המצב, התוצאה, גרסת התוצאה
        ונעילת הניחושים נשמרים; רק snapshot ספק מאומת שיגיע אחר כך רשאי לעדכן
        את המשחק.
      </p>

      <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-amber-400 bg-white p-3 text-sm font-semibold text-slate-900 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-700">
        <input
          ref={confirmationRef}
          type="checkbox"
          name="confirmation"
          value="CONFIRM_PROVIDER_HANDOFF"
          checked={confirmed}
          disabled={pending}
          onChange={(event) => setConfirmed(event.target.checked)}
          aria-invalid={state.confirmationError ? true : undefined}
          aria-describedby={
            state.confirmationError
              ? `${prefix}-description ${prefix}-confirmation-error`
              : `${prefix}-description`
          }
          className="mt-0.5 size-5 shrink-0 accent-blue-700"
        />
        אני מאשר/ת שהעדכון הבא של הספק יוכל להחליף את התוצאה הידנית הנוכחית.
      </label>
      {state.confirmationError ? (
        <p
          id={`${prefix}-confirmation-error`}
          className="mt-2 text-sm font-bold text-error-900"
        >
          {state.confirmationError}
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          disabled={pending || !confirmed}
          className="min-h-11 rounded-lg border border-amber-700 bg-white px-4 py-2.5 text-sm font-extrabold text-amber-950 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "מחזיר בעלות לספק..." : "אישור והחזרת בעלות לספק"}
        </button>
        {state.message ? (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={
              state.status === "error"
                ? "text-sm font-bold text-error-900"
                : "text-sm font-bold text-success-900"
            }
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
