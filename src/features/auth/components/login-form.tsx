"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { getSafeAuthErrorMessage } from "@/features/auth/errors";
import { getFieldErrors, loginSchema } from "@/features/auth/schemas";
import { createClient } from "@/lib/supabase/browser";

import { FieldError, FormMessage } from "./form-message";

export function LoginForm({
  nextPath,
  statusMessage,
}: {
  nextPath: string;
  statusMessage?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[] | undefined>
  >({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);

    const form = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });

    if (!parsed.success) {
      setFieldErrors(getFieldErrors(parsed.error));
      return;
    }

    setFieldErrors({});
    setPending(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);

    if (error) {
      setMessage(getSafeAuthErrorMessage(error, "login"));
      setPending(false);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {statusMessage ? <FormMessage kind="success">{statusMessage}</FormMessage> : null}
      {message ? <FormMessage kind="error">{message}</FormMessage> : null}

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
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="password" className="block text-sm font-semibold text-slate-800">
            סיסמה
          </label>
          <Link
            href="/forgot-password"
            className="text-sm font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
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
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-left outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
        />
        <FieldError id="password-error" messages={fieldErrors.password} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "מתחברים..." : "התחברות"}
      </button>
    </form>
  );
}
