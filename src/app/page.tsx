export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <section className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm">
        <p className="mb-3 text-sm text-slate-500">Predictor</p>

        <h1 className="mb-4 text-3xl font-bold">
          ברוכים הבאים ל־Predictor
        </h1>

        <p className="mb-6 text-slate-600">
          כאן תוכלו להשתתף בליגות חיזוי תוצאות כדורגל.
        </p>

        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">
          מצב הדגמה
        </span>
      </section>
    </main>
  );
}