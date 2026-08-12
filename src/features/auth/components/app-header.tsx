import Link from "next/link";

import { signOutAction } from "@/features/auth/actions";

export function AppHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/dashboard"
          className="font-bold text-slate-950 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          Predictor1
        </Link>
        <nav aria-label="ניווט משתמש" className="flex items-center gap-3 text-sm">
          <Link
            href="/profile"
            className="rounded-lg px-3 py-2 font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            פרופיל
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              התנתקות
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
