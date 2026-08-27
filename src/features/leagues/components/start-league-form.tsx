"use client";

import { useActionState } from "react";

import { FormMessage } from "@/features/auth/components/form-message";
import {
  startLeagueAction,
  type LeagueLifecycleActionState,
} from "@/features/leagues/actions";

const initialState: LeagueLifecycleActionState = { status: "idle" };

export function StartLeagueForm({ leagueId }: { leagueId: string }) {
  const [state, action, pending] = useActionState(
    startLeagueAction.bind(null, leagueId),
    initialState,
  );

  return (
    <form action={action} className="rounded-xl border border-navy-200 bg-navy-100 p-4">
      <h3 className="font-black text-navy-900">הפעלת התחרות</h3>
      <p className="mt-1 text-sm leading-6 text-navy-700">
        ההפעלה נועלת את חוקי הניקוד והפרסים. אפשר לבצע אותה פעם אחת בלבד.
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
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-action px-4 py-2 font-extrabold text-white hover:bg-action-hover disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-900"
      >
        {pending ? "מפעיל…" : "הפעלת הליגה"}
      </button>
    </form>
  );
}
