import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import { ErrorState } from "@/components/ui/error-state";
import { KeysetPagination } from "@/components/ui/keyset-pagination";
import { requireAuthenticatedUser } from "@/features/auth/session";
import { LocalDateTime } from "@/features/predictions/components/local-date-time";
import {
  DEFAULT_MATCH_TIME_ZONE,
  formatDateTimeInTimeZone,
  getMatchStatusLabel,
} from "@/features/predictions/display";
import { ManualMatchFormBoundary } from "@/features/scoring/components/manual-match-form-boundary";
import { ManualOverrideClearBoundary } from "@/features/scoring/components/manual-override-clear-boundary";
import {
  getSystemMatchEditorCatalog,
  getSystemMatchList,
} from "@/features/scoring/queries";
import { parseSystemMatchFilters } from "@/features/scoring/schemas";
import { parseOptionalKeysetCursor } from "@/lib/keyset-pagination";

export const dynamic = "force-dynamic";

function getSystemMatchesHref({
  cursor,
  round,
  season,
  status,
}: {
  cursor?: string | null;
  round?: string | null;
  season?: string | null;
  status?: string | null;
}) {
  const params = new URLSearchParams();
  if (season) params.set("season", season);
  if (status) params.set("status", status);
  if (round) params.set("round", round);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/admin/matches?${query}` : "/admin/matches";
}

export default async function SystemMatchesPage({
  searchParams,
}: {
  searchParams: Promise<{
    cursor?: string | string[];
    round?: string | string[];
    season?: string | string[];
    status?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const cursor = parseOptionalKeysetCursor(query.cursor);
  const filters = parseSystemMatchFilters(query);
  const { supabase } = await requireAuthenticatedUser("/admin/matches");

  if (!cursor.success || !filters.success) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <ErrorState>מסנן המשחקים או קישור העמוד אינו תקין.</ErrorState>
        <Link
          href="/admin/matches"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg px-3 font-bold text-navy-700 underline-offset-4 hover:underline"
        >
          חזרה לכל המשחקים
        </Link>
      </main>
    );
  }

  const [result, catalogResult] = await Promise.all([
    getSystemMatchList(supabase, filters.data, cursor.data),
    getSystemMatchEditorCatalog(supabase),
  ]);

  if (result.status === "denied" || catalogResult.status === "denied") {
    notFound();
  }

  const catalog =
    catalogResult.status === "found" &&
    catalogResult.catalog.seasons.length > 0 &&
    catalogResult.catalog.teams.length >= 2
      ? catalogResult.catalog
      : null;
  const createMatchId = catalog ? randomUUID() : null;
  const hasFilters =
    filters.data.seasonId !== undefined ||
    filters.data.status !== undefined ||
    filters.data.roundNumber !== undefined;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">מנהל מערכת</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            ניהול משחקים ותוצאות
          </h1>
          <p className="mt-2 max-w-2xl leading-7 text-slate-600">
            שינוי נשמר אטומית ומחשב ניקוד מחדש רק בליגות שאינן סופיות. עונה
            עם ליגה שהושלמה דורשת מסלול reconciliation מפורש.
          </p>
        </div>
        <nav aria-label="ניווט ניהול" className="flex flex-wrap gap-2">
          <Link
            href="/admin/sync"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            סטטוס סנכרון
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            חזרה לליגות
          </Link>
        </nav>
      </div>

      <aside className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        מועד הפתיחה מוזן ב־UTC ונבדק שוב לפי זמן מסד הנתונים. תיקון תוצאה
        מחליף את הניקוד הקודם; שינוי זהות נחסם לאחר ניחוש או נעילה.
      </aside>

      {catalog && createMatchId ? (
        <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm sm:p-6">
          <p className="text-sm font-semibold text-blue-700">Fallback ידני</p>
          <h2 className="mt-1 text-xl font-bold">יצירת משחק מקטלוג קיים</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            מזהה היצירה הונפק בשרת ונשאר יציב גם בניסיון חוזר. ניתן לבחור רק
            עונה ושתי קבוצות שכבר קיימות; אין במסך זה עריכת קבוצות.
          </p>
          <ManualMatchFormBoundary
            key={createMatchId}
            catalog={catalog}
            createMatchId={createMatchId}
          />
        </section>
      ) : (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
        >
          קטלוג העריכה אינו זמין כרגע. רשימת המשחקים והחזרת בעלות לספק נשארות
          זמינות בנפרד.
        </p>
      )}

      <form
        method="get"
        aria-label="סינון משחקי מערכת"
        className="mt-6 grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end"
      >
        <div className="min-w-0">
          <label htmlFor="system-season-filter" className="block text-sm font-bold text-slate-700">
            עונה
          </label>
          <input
            id="system-season-filter"
            name="season"
            list="system-season-options"
            defaultValue={filters.data.seasonId ?? ""}
            placeholder="מזהה עונה"
            maxLength={36}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-700"
          />
          <datalist id="system-season-options">
            {catalogResult.status === "found"
              ? catalogResult.catalog.seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name} · {season.competitionName}
                  </option>
                ))
              : null}
          </datalist>
        </div>
        <div className="min-w-0">
          <label htmlFor="system-status-filter" className="block text-sm font-bold text-slate-700">
            סטטוס
          </label>
          <select
            id="system-status-filter"
            name="status"
            defaultValue={filters.data.status ?? ""}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-700"
          >
            <option value="">כל הסטטוסים</option>
            <option value="scheduled">מתוכנן</option>
            <option value="live">בשידור חי</option>
            <option value="finished">הסתיים</option>
            <option value="postponed">נדחה</option>
            <option value="canceled">בוטל</option>
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="system-round-filter" className="block text-sm font-bold text-slate-700">
            מחזור
          </label>
          <input
            id="system-round-filter"
            name="round"
            type="number"
            min="1"
            max="100"
            inputMode="numeric"
            defaultValue={filters.data.roundNumber ?? ""}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-700"
          />
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <button
            type="submit"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-blue-700 px-4 py-2 font-bold text-white hover:bg-blue-800"
          >
            סינון
          </button>
          <Link
            href="/admin/matches"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-center font-bold text-slate-700 hover:bg-slate-50"
          >
            ניקוי
          </Link>
        </div>
      </form>

      {result.status === "error" ? (
        <div className="mt-6">
          <ErrorState>
            לא ניתן לטעון את רשימת המשחקים כרגע. קטלוג העריכה נשאר נפרד.
          </ErrorState>
        </div>
      ) : result.matches.items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          {cursor.data
            ? "אין משחקים נוספים בעמוד זה. אפשר לחזור לעמוד הראשון."
            : hasFilters
              ? "לא נמצאו משחקים שמתאימים למסננים שנבחרו."
              : "עדיין אין משחקים לעדכון."}
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          {result.matches.items.map((match) => (
            <article
              key={match.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
              aria-labelledby={`match-${match.id}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-500">מחזור {match.roundNumber}</p>
                  <h2 id={`match-${match.id}`} className="mt-1 text-xl font-bold">
                    {match.homeTeamName} — {match.awayTeamName}
                  </h2>
                  <span className="mt-2 block text-sm text-slate-600">
                    <LocalDateTime
                      instant={match.kickoffAt}
                      initialText={formatDateTimeInTimeZone(
                        match.kickoffAt,
                        DEFAULT_MATCH_TIME_ZONE,
                      )}
                      initialTimeZone={DEFAULT_MATCH_TIME_ZONE}
                    />
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-5 gap-y-1 rounded-xl bg-slate-50 p-3 text-sm">
                  <dt className="font-semibold text-slate-600">סטטוס</dt>
                  <dd>{getMatchStatusLabel(match.status)}</dd>
                  <dt className="font-semibold text-slate-600">גרסת תוצאה</dt>
                  <dd>{match.resultVersion}</dd>
                  <dt className="font-semibold text-slate-600">תוצאה</dt>
                  <dd>
                    {match.homeScore === null || match.awayScore === null
                      ? "—"
                      : `${match.homeScore}–${match.awayScore}`}
                  </dd>
                  <dt className="font-semibold text-slate-600">מקור</dt>
                  <dd>
                    {match.isManuallyOverridden
                      ? match.externalProvider
                        ? "תיקון ידני; זהות הספק נשמרה"
                        : "בעלות ידנית"
                      : match.externalProvider
                        ? "API-Football"
                        : "קטלוג Demo ידני"}
                  </dd>
                </dl>
              </div>
              {catalog ? (
                <ManualMatchFormBoundary catalog={catalog} match={match} />
              ) : (
                <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                  תיקון פרטי המשחק אינו זמין עד לטעינת קטלוג העריכה.
                </p>
              )}
              <ManualOverrideClearBoundary match={match} />
            </article>
          ))}
        </div>
      )}
      {result.status === "found" ? (
        <KeysetPagination
          ariaLabel="דפדוף במשחקי המערכת"
          firstHref={getSystemMatchesHref({
            round: filters.data.roundNumber?.toString(),
            season: filters.data.seasonId,
            status: filters.data.status,
          })}
          nextHref={
            result.matches.nextCursor
              ? getSystemMatchesHref({
                  cursor: result.matches.nextCursor,
                  round: filters.data.roundNumber?.toString(),
                  season: filters.data.seasonId,
                  status: filters.data.status,
                })
              : null
          }
          hasCurrentCursor={cursor.data !== undefined}
        />
      ) : null}
    </main>
  );
}
