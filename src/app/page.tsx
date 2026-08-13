import Link from "next/link";

import { getPublicEnv } from "@/lib/env";

export default function Home() {
  const { DEMO_MODE } = getPublicEnv();
  const modeLabel = DEMO_MODE ? "מצב הדגמה" : "מצב פיתוח מקומי";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <section
        aria-labelledby="home-title"
        className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-sm sm:p-8"
      >
        <p className="mb-3 text-sm text-slate-500">Predictor1</p>

        <h1 id="home-title" className="mb-4 text-3xl font-bold">
          ברוכים הבאים ל־Predictor1
        </h1>

        <p className="mb-6 text-slate-600">
          כאן תוכלו להשתתף בליגות חיזוי תוצאות כדורגל.
        </p>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/register"
            className="rounded-lg bg-blue-700 px-4 py-2.5 text-center font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            יצירת חשבון
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-center font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            התחברות
          </Link>
        </div>

        <span
          role="status"
          aria-label={modeLabel}
          className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800"
        >
          {modeLabel}
        </span>
      </section>
    </main>
  );
}
