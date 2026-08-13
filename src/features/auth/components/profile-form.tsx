"use client";

import { useActionState } from "react";

import {
  type ProfileActionState,
  updateProfileAction,
} from "@/features/auth/actions";

import { FieldError, FormMessage } from "./form-message";

export function ProfileForm({ displayName }: { displayName: string }) {
  const initialState: ProfileActionState = { status: "idle" };
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.message ? (
        <FormMessage kind={state.status === "success" ? "success" : "error"}>
          {state.message}
        </FormMessage>
      ) : null}

      <div>
        <label htmlFor="displayName" className="block text-sm font-semibold text-slate-800">
          שם תצוגה
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          defaultValue={displayName}
          maxLength={50}
          aria-invalid={Boolean(state.fieldErrors?.displayName)}
          aria-describedby={
            state.fieldErrors?.displayName ? "display-name-error" : "display-name-help"
          }
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
        />
        <p id="display-name-help" className="mt-1 text-sm text-slate-500">
          בין 2 ל־50 תווים. זהו השדה היחיד שניתן לערוך בפרופיל.
        </p>
        <FieldError
          id="display-name-error"
          messages={state.fieldErrors?.displayName}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "שומרים..." : "שמירת שם התצוגה"}
      </button>
    </form>
  );
}
