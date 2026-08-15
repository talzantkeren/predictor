import Link from "next/link";

export function AuthCard({
  eyebrow = "Predictor1",
  title,
  description,
  children,
  footer,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: { label: string; linkLabel: string; href: string };
}) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 sm:py-12">
      <section
        aria-labelledby="auth-title"
        className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <p className="mb-2 text-sm font-semibold text-blue-700">{eyebrow}</p>
        <h1 id="auth-title" className="text-3xl font-bold tracking-tight">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>

        <div className="mt-7">{children}</div>

        {footer ? (
          <p className="mt-6 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
            {footer.label}{" "}
            <Link
              href={footer.href}
              prefetch={false}
              className="font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              {footer.linkLabel}
            </Link>
          </p>
        ) : null}
      </section>
    </main>
  );
}
