"use client";

import { useActionState } from "react";

import {
  triggerSportsSyncAction,
  type SyncTriggerActionState,
} from "@/features/sync/actions";

const initialState: SyncTriggerActionState = { status: "idle" };

export function SyncTriggerForm() {
  const [state, action, pending] = useActionState(
    triggerSportsSyncAction,
    initialState,
  );
  const isError = state.status === "error";

  return (
    <form action={action} className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold text-blue-950">הפעלה ידנית מאובטחת</h2>
          <p className="mt-1 text-sm leading-6 text-blue-900">
            ההפעלה עוקפת את חלון הזמן בלבד. היא עדיין כפופה ל־lease ול־fencing,
            ולעולם אינה חושפת מפתח ספק לדפדפן.
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 shrink-0 rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
        >
          {pending ? "מסנכרן…" : "הפעלת סנכרון"}
        </button>
      </div>
      {state.message ? (
        <p
          role={isError ? "alert" : "status"}
          className={`mt-3 rounded-lg border p-3 text-sm ${
            isError
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-slate-200 bg-white text-slate-800"
          }`}
        >
          {state.message}
          {state.runId ? (
            <span className="mt-1 block break-all font-mono text-xs" dir="ltr">
              {state.runId}
            </span>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
