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
    <main className="min-h-screen bg-background px-4 py-8 text-ink sm:px-6 sm:py-12">
      <section
        aria-labelledby="auth-title"
        className="mx-auto w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8"
      >
        <p className="mb-2 text-sm font-extrabold text-action">{eyebrow}</p>
        <h1 id="auth-title" className="text-3xl font-black tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-secondary">{description}</p>

        <div className="mt-7">{children}</div>

        {footer ? (
          <p className="mt-6 border-t border-line pt-5 text-center text-sm text-ink-secondary">
            {footer.label}{" "}
            <Link
              href={footer.href}
              prefetch={false}
              className="font-bold text-navy-700 underline-offset-4 hover:underline focus-visible:rounded"
            >
              {footer.linkLabel}
            </Link>
          </p>
        ) : null}
      </section>
    </main>
  );
}
