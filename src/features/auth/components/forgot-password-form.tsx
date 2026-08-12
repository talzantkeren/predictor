"use client";

import { type FormEvent, useState } from "react";

import { getFieldErrors, forgotPasswordSchema } from "@/features/auth/schemas";
import { createClient } from "@/lib/supabase/browser";

import { FieldError, FormMessage } from "./form-message";

const CONSISTENT_SUCCESS_MESSAGE =
  "אם קיים חשבון התואם לכתובת, נשלח אליו קישור לשחזור הסיסמה.";

export function ForgotPasswordForm({ statusMessage }: { statusMessage?: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(statusMessage);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[] | undefined>
  >({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const parsed = forgotPasswordSchema.safeParse({ email: form.get("email") });

    if (!parsed.success) {
      setFieldErrors(getFieldErrors(parsed.error));
      return;
    }

    setFieldErrors({});
    setPending(true);

    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/update-password`,
    });

    formElement.reset();
    setMessage(CONSISTENT_SUCCESS_MESSAGE);
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {message ? <FormMessage kind="info">{message}</FormMessage> : null}

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
