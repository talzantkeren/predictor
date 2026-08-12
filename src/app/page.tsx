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
          ברוכים הבאים ל־Predictor
        </h1>

        <p className="mb-6 text-slate-600">
          כאן תוכלו להשתתף בליגות חיזוי תוצאות כדורגל.
        </p>

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
