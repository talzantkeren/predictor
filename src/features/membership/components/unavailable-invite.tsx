import Link from "next/link";

import { SkipToMainLink } from "@/components/ui/skip-to-main-link";

export function UnavailableInvite() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <SkipToMainLink />
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-screen px-4 py-8 outline-none sm:px-6 sm:py-12"
      >
        <section
          aria-labelledby="invite-unavailable-title"
          className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <p className="text-sm font-semibold text-blue-700">Predictor1</p>
          <h1 id="invite-unavailable-title" className="mt-2 text-3xl font-bold">
            קישור ההזמנה אינו זמין
          </h1>
          <p className="mt-3 leading-7 text-slate-600">
            ייתכן שהקישור אינו תקין, בוטל או שפג תוקפו. אפשר לבקש ממנהל/ת הליגה קישור חדש.
          </p>
          <Link
            href="/"
            prefetch={false}
            className="mt-6 inline-flex rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            חזרה לעמוד הראשי
          </Link>
        </section>
      </main>
    </div>
  );
}
