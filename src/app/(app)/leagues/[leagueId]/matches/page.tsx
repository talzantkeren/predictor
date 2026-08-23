import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/features/auth/session";
import { LocalDateTime } from "@/features/predictions/components/local-date-time";
import { LockCountdown } from "@/features/predictions/components/lock-countdown";
import {
  canWritePrediction,
  DEFAULT_MATCH_TIME_ZONE,
  derivePredictionDisplayState,
  formatDateTimeInTimeZone,
  getCountdownSeconds,
  getMatchStatusLabel,
  getProviderReviewLabel,
  getPredictionStateLabel,
} from "@/features/predictions/display";
import { getLeagueMatchList } from "@/features/predictions/queries";
import { parseMatchListFilter } from "@/features/predictions/schemas";

export const dynamic = "force-dynamic";

export default async function LeagueMatchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ round?: string | string[]; date?: string | string[] }>;
}) {
  const { leagueId } = await params;
  if (!z.string().uuid().safeParse(leagueId).success) notFound();

  const query = await searchParams;
  const filter = parseMatchListFilter(query);
  const { supabase, user } = await requireAuthenticatedUser(
    `/leagues/${leagueId}/matches`,
  );
  const result = await getLeagueMatchList(
    supabase,
    leagueId,
    user.id,
    filter.success ? filter.data : undefined,
  );

  if (result.status === "not-found") notFound();
  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          לא ניתן לטעון את משחקי הליגה כרגע. יש לרענן ולנסות שוב.
        </p>
      </main>
    );
  }

  if (!filter.success) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          מסנן המחזור או התאריך אינו תקין.
        </p>
        <Link href={`/leagues/${leagueId}/matches`} className="mt-4 inline-block font-semibold text-blue-700 underline">
          הצגת כל המשחקים
        </Link>
      </main>
    );
  }

  const data = result.data;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">
            {data.league.competitionName} · {data.league.seasonName}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">משחקים וניחושים</h1>
          <p className="mt-2 break-words text-slate-600">{data.league.name}</p>
        </div>
        <Link
          href={`/leagues/${leagueId}`}
          className="self-start rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          חזרה לליגה
        </Link>
      </div>

      <section aria-label="סינון משחקים" className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
        <form method="get" className="flex min-w-0 items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="round-filter" className="block text-sm font-semibold text-slate-800">
              מחזור
            </label>
            <select
              id="round-filter"
              name="round"
              defaultValue={filter.data?.kind === "round" ? String(filter.data.round) : ""}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="" disabled>בחירת מחזור</option>
              {data.roundOptions.map((round) => (
                <option key={round} value={round}>מחזור {round}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
            סינון
          </button>
        </form>

        <form method="get" className="flex min-w-0 items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="date-filter" className="block text-sm font-semibold text-slate-800">
              תאריך משחק
            </label>
            <input
              id="date-filter"
              name="date"
              type="date"
              defaultValue={filter.data?.kind === "date" ? filter.data.date : ""}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
            סינון
          </button>
        </form>

        <Link
          href={`/leagues/${leagueId}/matches`}
          className="self-end rounded-lg border border-slate-300 px-4 py-2.5 text-center font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          ניקוי מסנן
        </Link>
      </section>

      {!data.viewerIsActiveMember ? (
        <p role="status" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          אפשר לצפות בלוח כמנהל/ת הליגה, אך שמירה וקריאת ניחושים דורשות חברות פעילה.
        </p>
      ) : null}

      {data.matches.length === 0 ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center">
          <h2 className="text-xl font-bold">אין משחקים</h2>
          <p className="mt-2 text-slate-600">לא נמצאו משחקים שמתאימים למסנן שנבחר.</p>
        </section>
      ) : (
        <ol className="mt-6 grid gap-5 lg:grid-cols-2">
          {data.matches.map((match) => {
            const providerReviewLabel = getProviderReviewLabel(
              match.providerStatus,
            );
            const displayState = derivePredictionDisplayState({
              leagueStatus: data.league.status,
              status: match.status,
              kickoffAt: match.kickoffAt,
              predictionsLockedAt: match.predictionsLockedAt,
              now: data.databaseNow,
              isActiveMember: data.viewerIsActiveMember,
              hasPrediction: Boolean(match.ownPrediction),
            });
            const writable = canWritePrediction({
              leagueStatus: data.league.status,
              status: match.status,
              kickoffAt: match.kickoffAt,
              predictionsLockedAt: match.predictionsLockedAt,
              now: data.databaseNow,
              isActiveMember: data.viewerIsActiveMember,
            });
            const finishedResult =
              match.status === "finished" &&
              match.homeScore !== null &&
              match.awayScore !== null;

            return (
              <li key={match.id}>
                <article className="h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-blue-800">מחזור {match.roundNumber}</span>
                    <span
                      className={`rounded-full px-3 py-1 font-semibold ${
                        providerReviewLabel
                          ? "bg-amber-100 text-amber-900"
                          : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {providerReviewLabel ?? getMatchStatusLabel(match.status)}
                    </span>
                  </div>

                  <h2 className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-center text-lg font-bold">
                    <span className="break-words">{match.homeTeam.name}</span>
                    <span className="text-slate-400">–</span>
                    <span className="break-words">{match.awayTeam.name}</span>
                  </h2>

                  {finishedResult ? (
                    <p className="mt-3 text-center text-2xl font-black" aria-label="תוצאת המשחק">
                      {match.homeScore}–{match.awayScore}
                    </p>
                  ) : null}

                  <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">
                    <div>
                      <dt className="font-semibold text-slate-600">מועד פתיחה מוחלט</dt>
                      <dd className="mt-1">
                        <LocalDateTime
                          instant={match.kickoffAt}
                          initialText={formatDateTimeInTimeZone(match.kickoffAt, DEFAULT_MATCH_TIME_ZONE)}
                          initialTimeZone={DEFAULT_MATCH_TIME_ZONE}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-600">נעילת ניחוש</dt>
                      <dd className="mt-1">
                        {writable ? (
                          <LockCountdown initialSeconds={getCountdownSeconds(match.kickoffAt, data.databaseNow)} />
                        ) : (
                          <span className="font-semibold text-slate-700">{getPredictionStateLabel(displayState)}</span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5 rounded-xl bg-slate-50 p-4">
                    <p className="font-semibold text-slate-900">{getPredictionStateLabel(displayState)}</p>
                    {match.ownPrediction ? (
                      <div className="mt-2 text-sm text-slate-700">
                        <p className="text-lg font-bold text-slate-950">
                          {match.ownPrediction.predictedHomeScore}–{match.ownPrediction.predictedAwayScore}
                        </p>
                        <p className="mt-1">
                          נשמר לאחרונה: {" "}
                          <LocalDateTime
                            instant={match.ownPrediction.updatedAt}
                            initialText={formatDateTimeInTimeZone(match.ownPrediction.updatedAt, DEFAULT_MATCH_TIME_ZONE)}
                            initialTimeZone={DEFAULT_MATCH_TIME_ZONE}
                          />
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-slate-600">טרם נשמר ניחוש למשחק.</p>
                    )}
                  </div>

                  {data.viewerIsActiveMember ? (
                    <Link
                      href={`/matches/${match.id}?league=${leagueId}`}
                      className="mt-5 flex justify-center rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                    >
                      פתיחת המשחק והניחוש
                    </Link>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
