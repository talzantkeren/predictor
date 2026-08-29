import Link from "@/components/ui/app-link";

export function KeysetPagination({
  ariaLabel,
  firstHref,
  nextHref,
  hasCurrentCursor,
}: {
  ariaLabel: string;
  firstHref: string;
  nextHref: string | null;
  hasCurrentCursor: boolean;
}) {
  if (!hasCurrentCursor && nextHref === null) {
    return null;
  }

  return (
    <nav
      aria-label={ariaLabel}
      className="mt-5 flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3"
    >
      {hasCurrentCursor ? (
        <Link
          href={firstHref}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-control-border px-4 py-2 text-center font-extrabold text-navy-700 hover:bg-navy-100"
        >
          לעמוד הראשון
        </Link>
      ) : null}
      {nextHref ? (
        <Link
          href={nextHref}
          rel="next"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-action px-4 py-2 text-center font-extrabold text-white hover:bg-action-hover"
        >
          לעמוד הבא
        </Link>
      ) : (
        <span role="status" className="px-2 text-sm font-bold text-ink-secondary">
          הגעת לסוף הרשימה.
        </span>
      )}
    </nav>
  );
}
