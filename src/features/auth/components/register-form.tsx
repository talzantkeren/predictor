"use client";

import { useActionState } from "react";

import {
  registerAction,
  type AuthActionState,
} from "@/features/auth/actions";

import { FieldError, FormMessage } from "./form-message";

export function RegisterForm() {
  const initialState: AuthActionState = { status: "idle" };
  const [state, formAction, pending] = useActionState(registerAction, initialState);
  const fieldErrors = state.fieldErrors ?? {};

  if (state.status === "success") {
    return <FormMessage kind="success">{state.message}</FormMessage>;
  }

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.message ? <FormMessage kind="error">{state.message}</FormMessage> : null}

      <div>
        <label htmlFor="displayName" className="block text-sm font-semibold text-slate-800">
          שם תצוגה
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          maxLength={50}
          aria-invalid={Boolean(fieldErrors.displayName)}
          aria-describedby={fieldErrors.displayName ? "display-name-error" : undefined}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
        />
        <FieldError id="display-name-error" messages={fieldErrors.displayName} />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-semibold text-slate-800">
          כתובת אימייל
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-left outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
        />
        <FieldError id="email-error" messages={fieldErrors.email} />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-semibold text-slate-800">
          סיסמה
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          minLength={8}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-left outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
        />
        <FieldError id="password-error" messages={fieldErrors.password} />
      </div>

      <div>
        <label htmlFor="passwordConfirmation" className="block text-sm font-semibold text-slate-800">
          אימות סיסמה
        </label>
        <input
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          minLength={8}
          aria-invalid={Boolean(fieldErrors.passwordConfirmation)}
          aria-describedby={
            fieldErrors.passwordConfirmation ? "password-confirmation-error" : undefined
          }
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-left outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
        />
        <FieldError
          id="password-confirmation-error"
          messages={fieldErrors.passwordConfirmation}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "נרשמים..." : "יצירת חשבון"}
      </button>
    </form>
  );
}
