"use client";

import { useActionState } from "react";

import {
  registerAction,
  type AuthActionState,
} from "@/features/auth/actions";
import { PASSWORD_MAX_UTF8_BYTES } from "@/features/auth/schemas";

import { FieldError, FormMessage } from "./form-message";

export function RegisterForm({ nextPath }: { nextPath: string }) {
  const initialState: AuthActionState = { status: "idle" };
  const [state, formAction, pending] = useActionState(registerAction, initialState);
  const fieldErrors = state.fieldErrors ?? {};

  if (state.status === "success") {
    return <FormMessage kind="success">{state.message}</FormMessage>;
  }

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="next" value={nextPath} />
      {state.message ? <FormMessage kind="error">{state.message}</FormMessage> : null}

      <div>
        <label htmlFor="displayName" className="block text-sm font-bold text-ink">
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
          className="mt-2 min-h-11 w-full rounded-lg border border-control-border bg-white px-3 py-2 text-ink outline-none transition focus:border-focus focus:ring-2 focus:ring-navy-200"
        />
        <FieldError id="display-name-error" messages={fieldErrors.displayName} />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-bold text-ink">
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
          className="mt-2 min-h-11 w-full rounded-lg border border-control-border bg-white px-3 py-2 text-left text-ink outline-none transition focus:border-focus focus:ring-2 focus:ring-navy-200"
        />
        <FieldError id="email-error" messages={fieldErrors.email} />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-bold text-ink">
          סיסמה
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          minLength={8}
          maxLength={PASSWORD_MAX_UTF8_BYTES}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
          className="mt-2 min-h-11 w-full rounded-lg border border-control-border bg-white px-3 py-2 text-left text-ink outline-none transition focus:border-focus focus:ring-2 focus:ring-navy-200"
        />
        <FieldError id="password-error" messages={fieldErrors.password} />
      </div>

      <div>
        <label htmlFor="passwordConfirmation" className="block text-sm font-bold text-ink">
          אימות סיסמה
        </label>
        <input
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          minLength={8}
          maxLength={PASSWORD_MAX_UTF8_BYTES}
          aria-invalid={Boolean(fieldErrors.passwordConfirmation)}
          aria-describedby={
            fieldErrors.passwordConfirmation ? "password-confirmation-error" : undefined
          }
          className="mt-2 min-h-11 w-full rounded-lg border border-control-border bg-white px-3 py-2 text-left text-ink outline-none transition focus:border-focus focus:ring-2 focus:ring-navy-200"
        />
        <FieldError
          id="password-confirmation-error"
          messages={fieldErrors.passwordConfirmation}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-lg bg-action px-4 py-2.5 font-extrabold text-white transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "נרשמים..." : "יצירת חשבון"}
      </button>
    </form>
  );
}
