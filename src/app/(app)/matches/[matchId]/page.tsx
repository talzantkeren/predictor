import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/features/auth/session";
import { LocalDateTime } from "@/features/predictions/components/local-date-time";
import { LockCountdown } from "@/features/predictions/components/lock-countdown";
import { PredictionForm } from "@/features/predictions/components/prediction-form";
import {
  canWritePrediction,
  DEFAULT_MATCH_TIME_ZONE,
  formatDateTimeInTimeZone,
  getCountdownSeconds,
  getMatchStatusLabel,
  isKickoffLocked,
} from "@/features/predictions/display";
import { getMatchDetail } from "@/features/predictions/queries";

export const dynamic = "force-dynamic";

export default async function MatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ league?: string | string[] }>;
}) {
  const { matchId } = await params;
  if (!z.string().uuid().safeParse(matchId).success) notFound();

  const leagueCandidate = (await searchParams).league;
  if (Array.isArray(leagueCandidate)) notFound();
  if (leagueCandidate && !z.string().uuid().safeParse(leagueCandidate).success) notFound();

  const { supabase, user } = await requireAuthenticatedUser(`/matches/${matchId}`);
  const result = await getMatchDetail(supabase, matchId, user.id, leagueCandidate);

  if (result.status === "not-found") notFound();
  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          לא ניתן לטעון את המשחק כרגע. יש לרענן ולנסות שוב.
        </p>
      </main>
    );
  }

  if (result.status === "selection-required") {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-blue-700">מחזור {result.match.roundNumber}</p>
          <h1 className="mt-2 text-2xl font-bold">
            {result.match.homeTeam.name} – {result.match.awayTeam.name}
          </h1>
          <h2 className="mt-6 text-lg font-bold">בחירת ליגה לניחוש</h2>
          <p className="mt-2 text-slate-600">
            המשחק שייך ליותר מליגה פרטית אחת שלך. הניחוש נשמר בנפרד בכל ליגה.
          </p>
          <ul className="mt-4 grid gap-3">
            {result.eligibleLeagues.map((league) => (
              <li key={league.id}>
                <Link
                  href={`/matches/${matchId}?league=${league.id}`}
                  className="block rounded-lg border border-blue-300 px-4 py-3 font-semibold text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                >
                  {league.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    );
  }

  const data = result.data;
  const locked = isKickoffLocked(data.match.kickoffAt, data.databaseNow);
  const writable = canWritePrediction({
    leagueStatus: data.league.status,
    status: data.match.status,
    kickoffAt: data.match.kickoffAt,
    now: data.databaseNow,
    isActiveMember: true,
  });
  const finishedResult =
    data.match.status === "finished" &&
    data.match.homeScore !== null &&
    data.match.awayScore !== null;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">{data.league.name} · מחזור {data.match.roundNumber}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {data.match.homeTeam.name} – {data.match.awayTeam.name}
          </h1>
        </div>
        <Link
          href={`/leagues/${data.league.id}/matches`}
          className="self-start rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          חזרה למשחקי הליגה
        </Link>
      </div>

      {data.eligibleLeagues.length > 1 ? (
        <nav aria-label="בחירת ליגה" className="mt-5 flex flex-wrap gap-2">
          {data.eligibleLeagues.map((league) => (
            <Link
              key={league.id}
              href={`/matches/${matchId}?league=${league.id}`}
              aria-current={league.id === data.league.id ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                league.id === data.league.id
                  ? "bg-blue-700 text-white"
                  : "border border-slate-300 bg-white text-slate-700"
              }`}
            >
              {league.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="match-information-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="match-information-title" className="text-xl font-bold">פרטי המשחק</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-800">
            {getMatchStatusLabel(data.match.status)}
          </span>
        </div>
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 text-center">
          <span className="break-words text-xl font-bold">{data.match.homeTeam.name}</span>
          <span className="text-2xl font-black text-slate-400">
            {finishedResult ? `${data.match.homeScore}–${data.match.awayScore}` : "–"}
          </span>
          <span className="break-words text-xl font-bold">{data.match.awayTeam.name}</span>
        </div>
        <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-semibold text-slate-600">מועד פתיחה מוחלט</dt>
            <dd className="mt-1">
              <LocalDateTime
                instant={data.match.kickoffAt}
                initialText={formatDateTimeInTimeZone(data.match.kickoffAt, DEFAULT_MATCH_TIME_ZONE)}
                initialTimeZone={DEFAULT_MATCH_TIME_ZONE}
              />
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-slate-600">מצב נעילה לפי מסד הנתונים</dt>
            <dd className="mt-1">
              {writable ? (
                <LockCountdown initialSeconds={getCountdownSeconds(data.match.kickoffAt, data.databaseNow)} />
              ) : (
                <span className="font-semibold">
                  {locked
                    ? "הניחוש נעול"
                    : data.league.status === "completed" || data.league.status === "archived"
                      ? "הליגה זמינה לקריאה בלבד"
                      : "ניחוש אינו זמין בסטטוס זה"}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="my-prediction-title">
        <h2 id="my-prediction-title" className="text-xl font-bold">הניחוש שלי</h2>
        {writable ? (
          <div className="mt-5">
            {data.ownPrediction ? (
              <p className="mb-5 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                נשמר לאחרונה: {" "}
                <LocalDateTime
                  instant={data.ownPrediction.updatedAt}
                  initialText={formatDateTimeInTimeZone(data.ownPrediction.updatedAt, DEFAULT_MATCH_TIME_ZONE)}
                  initialTimeZone={DEFAULT_MATCH_TIME_ZONE}
                />
              </p>
            ) : null}
            <PredictionForm
              leagueId={data.league.id}
              matchId={data.match.id}
              homeTeamName={data.match.homeTeam.name}
              awayTeamName={data.match.awayTeam.name}
              prediction={data.ownPrediction}
            />
          </div>
        ) : data.ownPrediction ? (
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="text-2xl font-black">
              {data.ownPrediction.predictedHomeScore}–{data.ownPrediction.predictedAwayScore}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              נשמר לאחרונה: {" "}
              <LocalDateTime
                instant={data.ownPrediction.updatedAt}
                initialText={formatDateTimeInTimeZone(data.ownPrediction.updatedAt, DEFAULT_MATCH_TIME_ZONE)}
                initialTimeZone={DEFAULT_MATCH_TIME_ZONE}
              />
            </p>
            <p className="mt-2 font-semibold text-slate-800">
              {locked
                ? "הניחוש נשמר ונעול לעריכה."
                : data.league.status === "completed" || data.league.status === "archived"
                  ? "הניחוש נשמר, והליגה זמינה כעת לקריאה בלבד."
                  : "הניחוש נשמר, אך סטטוס המשחק אינו מאפשר עריכה."}
            </p>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-slate-600">
            לא נשמר ניחוש למשחק הזה, וכעת לא ניתן ליצור ניחוש חדש.
          </p>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="league-predictions-title">
        <h2 id="league-predictions-title" className="text-xl font-bold">ניחושי חברי הליגה</h2>
        {!locked ? (
          <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
            ניחושי משתתפים אחרים מוסתרים עד מועד הפתיחה. רק הניחוש שלך זמין לך כעת.
          </p>
        ) : data.revealedPredictions.length === 0 ? (
          <p className="mt-3 rounded-xl bg-slate-50 p-4 text-slate-600">לא הוגשו ניחושים למשחק.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.revealedPredictions.map((prediction) => (
              <li key={prediction.id} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-4">
                <span className="min-w-0 break-words font-semibold">
                  {prediction.displayName}{prediction.isViewer ? " (אני)" : ""}
                </span>
                <span className="shrink-0 text-xl font-black">
                  {prediction.predictedHomeScore}–{prediction.predictedAwayScore}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
