"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { getSafeAuthErrorMessage } from "@/features/auth/errors";
import { getFieldErrors, updatePasswordSchema } from "@/features/auth/schemas";
import { createClient } from "@/lib/supabase/browser";

import { FieldError, FormMessage } from "./form-message";

export function UpdatePasswordForm() {
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
    const parsed = updatePasswordSchema.safeParse({
      password: form.get("password"),
      passwordConfirmation: form.get("passwordConfirmation"),
    });

    if (!parsed.success) {
      setFieldErrors(getFieldErrors(parsed.error));
      return;
    }

    setFieldErrors({});
    setPending(true);

    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("הקישור אינו תקף או שפג תוקפו. יש לבקש קישור חדש.");
      setPending(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });

    if (error) {
      setMessage(getSafeAuthErrorMessage(error, "password-update"));
      setPending(false);
      return;
    }

    await supabase.auth.signOut({ scope: "local" });
    router.replace("/login?status=password-updated");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {message ? <FormMessage kind="error">{message}</FormMessage> : null}

      <div>
        <label htmlFor="password" className="block text-sm font-semibold text-slate-800">
          סיסמה חדשה
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
          אימות סיסמה חדשה
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
        {pending ? "מעדכנים..." : "עדכון סיסמה"}
      </button>
    </form>
  );
}
