"use client";

import { useActionState } from "react";

import {
  forgotPasswordAction,
  type AuthActionState,
} from "@/features/auth/actions";

import { FieldError, FormMessage } from "./form-message";

export function ForgotPasswordForm({ statusMessage }: { statusMessage?: string }) {
  const initialState: AuthActionState = { status: "idle" };
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    initialState,
  );
  const fieldErrors = state.fieldErrors ?? {};
  const message = state.message ?? statusMessage;

  return (
    <form action={formAction} noValidate className="space-y-5">
      {message ? (
        <FormMessage kind={state.status === "error" ? "error" : "info"}>
          {message}
        </FormMessage>
      ) : null}

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

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "שולחים..." : "שליחת קישור לשחזור"}
      </button>
    </form>
  );
}
