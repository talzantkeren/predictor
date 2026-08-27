"use client";

import { useActionState } from "react";

import { FormMessage } from "@/features/auth/components/form-message";
import type { LifecycleDecisionActionState } from "@/features/scoring/lifecycle-decision-action-state";

type ReconciliationAction = (
  previousState: LifecycleDecisionActionState,
  formData: FormData,
) => Promise<LifecycleDecisionActionState>;

const initialState: LifecycleDecisionActionState = { status: "idle" };

export function CompletedReconciliationForm({
  action,
}: {
  action: ReconciliationAction;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-3">
      {state.message ? (
        <div className="mb-3">
          <FormMessage kind={state.status === "error" ? "error" : "success"}>
            {state.message}
          </FormMessage>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          name="decision"
          value="apply"
          disabled={pending}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-blue-700 px-4 py-2 font-bold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "שומר…" : "החלת התוצאה הסופית"}
        </button>
        <button
          type="submit"
          name="decision"
          value="dismiss"
          disabled={pending}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-400 bg-white px-4 py-2 font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
        >
          דחייה ללא שינוי
        </button>
      </div>
    </form>
  );
}
