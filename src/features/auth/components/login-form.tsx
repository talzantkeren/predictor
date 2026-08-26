"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type AuthActionState } from "@/features/auth/actions";
import type { AuthFlowPresentation } from "@/features/auth/auth-flow-results";

import { FieldError, FormMessage } from "./form-message";

export function LoginForm({
  nextPath,
  statusPresentation,
}: {
  nextPath: string;
  statusPresentation?: AuthFlowPresentation;
}) {
  const initialState: AuthActionState = { status: "idle" };
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="next" value={nextPath} />
      {statusPresentation ? (
        <FormMessage kind={statusPresentation.kind}>
          {statusPresentation.message}
        </FormMessage>
      ) : null}
      {state.message ? <FormMessage kind="error">{state.message}</FormMessage> : null}

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
          className="mt-2 w-full rounded-lg border border-control-border bg-white px-3 py-2 text-left text-ink outline-none transition focus:border-focus focus:ring-2 focus:ring-navy-200"
        />
        <FieldError id="email-error" messages={fieldErrors.email} />
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="password" className="block text-sm font-bold text-ink">
            סיסמה
          </label>
          <Link
            href="/forgot-password"
            className="text-sm font-bold text-navy-700 underline-offset-4 hover:underline focus-visible:rounded"
          >
            שכחתי סיסמה
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          minLength={8}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
          className="mt-2 w-full rounded-lg border border-control-border bg-white px-3 py-2 text-left text-ink outline-none transition focus:border-focus focus:ring-2 focus:ring-navy-200"
        />
        <FieldError id="password-error" messages={fieldErrors.password} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-lg bg-action px-4 py-2.5 font-extrabold text-white transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "מתחברים..." : "התחברות"}
      </button>
    </form>
  );
}
