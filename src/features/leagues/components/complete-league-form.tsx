"use client";

import { useActionState } from "react";

import { FormMessage } from "@/features/auth/components/form-message";
import {
  completeLeagueAction,
  type LeagueLifecycleActionState,
} from "@/features/leagues/actions";

const initialState: LeagueLifecycleActionState = { status: "idle" };

export function CompleteLeagueForm({ leagueId }: { leagueId: string }) {
  const [state, action, pending] = useActionState(
    completeLeagueAction.bind(null, leagueId),
    initialState,
  );

  return (
    <form
      action={action}
      className="rounded-xl border border-locked-200 bg-locked-50 p-4"
    >
      <h3 className="font-black text-locked-900">השלמת התחרות</h3>
      <p className="mt-1 text-sm leading-6 text-locked-900">
        הפעולה זמינה רק לאחר שכל המשחקים הסתיימו וכל הניקוד מעודכן. היא מקפיאה
        את התוצאות הסופיות וסוגרת בקשות הצטרפות פתוחות.
      </p>
      {state.message ? (
        <div className="mt-3">
          <FormMessage kind={state.status === "error" ? "error" : "success"}>
            {state.message}
          </FormMessage>
        </div>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-locked-900 px-4 py-2 font-extrabold text-white hover:bg-navy-900 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-900"
      >
        {pending ? "משלים…" : "השלמת הליגה"}
      </button>
    </form>
  );
}
