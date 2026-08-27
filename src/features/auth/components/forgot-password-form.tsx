"use client";

import { useActionState } from "react";

import { forgotPasswordAction } from "@/features/auth/actions";
import {
  getRecoveryRequestPresentation,
  type AuthFlowPresentation,
  type RecoveryRequestState,
} from "@/features/auth/auth-flow-results";

import { FieldError, FormMessage } from "./form-message";

export function ForgotPasswordForm({
  statusPresentation,
}: {
  statusPresentation?: AuthFlowPresentation;
}) {
  const initialState: RecoveryRequestState = { outcome: "IDLE" };
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    initialState,
  );
  const fieldErrors =
    state.outcome === "VALIDATION_ERROR" ? state.fieldErrors : {};
  const presentation =
    getRecoveryRequestPresentation(state.outcome) ?? statusPresentation;

  return (
    <form action={formAction} noValidate className="space-y-5">
      {presentation ? (
        <FormMessage kind={presentation.kind}>
          {presentation.message}
        </FormMessage>
      ) : null}

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

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-lg bg-action px-4 py-2.5 font-extrabold text-white transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "שולחים..." : "שליחת קישור לשחזור"}
      </button>
    </form>
  );
}
