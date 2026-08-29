import Link from "@/components/ui/app-link";

import { SkipToMainLink } from "@/components/ui/skip-to-main-link";
import { signOutAction } from "@/features/auth/actions";

export function AppHeader() {
  return (
    <header className="border-b border-line bg-white">
      <SkipToMainLink />
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/dashboard"
          aria-label="מעבר ללוח האישי"
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg font-extrabold text-navy-900 sm:justify-start"
        >
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy-900 text-lg font-black text-white"
          >
            P1
          </span>
          <span dir="ltr" className="hidden text-lg sm:inline">
            Predictor1
          </span>
        </Link>
        <nav
          aria-label="ניווט משתמש"
          className="flex min-w-0 items-center gap-1 text-sm sm:gap-2"
        >
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center rounded-lg px-2 font-bold text-navy-700 transition hover:bg-navy-100 sm:px-3"
          >
            הליגות שלי
          </Link>
          <Link
            href="/profile"
            className="inline-flex min-h-11 items-center rounded-lg px-2 font-bold text-navy-700 transition hover:bg-navy-100 sm:px-3"
          >
            פרופיל
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-lg px-2 font-bold text-ink-muted transition hover:bg-locked-50 hover:text-navy-900 sm:px-3"
            >
              התנתקות
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
