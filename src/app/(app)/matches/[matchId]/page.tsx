import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ErrorState } from "@/components/ui/error-state";
import { IsolatedText } from "@/components/ui/isolated-text";
import { KeysetPagination } from "@/components/ui/keyset-pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAuthenticatedUser } from "@/features/auth/session";
import { LocalDateTime } from "@/features/predictions/components/local-date-time";
import { LockCountdown } from "@/features/predictions/components/lock-countdown";
import { PredictionForm } from "@/features/predictions/components/prediction-form";
import { ScorePair } from "@/features/predictions/components/score-pair";
import {
  canWritePrediction,
  DEFAULT_MATCH_TIME_ZONE,
  formatDateTimeInTimeZone,
  getCountdownSeconds,
  getMatchStatusLabel,
  getProviderReviewLabel,
  isKickoffLocked,
} from "@/features/predictions/display";
import { getMatchDetail } from "@/features/predictions/queries";
import { parseOptionalKeysetCursor } from "@/lib/keyset-pagination";

export const dynamic = "force-dynamic";

function getMatchHref(
  matchId: string,
  values: {
    league?: string | null;
    leagueCursor?: string | null;
    predictionCursor?: string | null;
  },
) {
  const params = new URLSearchParams();
  if (values.league) params.set("league", values.league);
  if (values.leagueCursor) params.set("leagueCursor", values.leagueCursor);
  if (values.predictionCursor) {
    params.set("predictionCursor", values.predictionCursor);
  }
  const query = params.toString();
  return query ? `/matches/${matchId}?${query}` : `/matches/${matchId}`;
}

export default async function MatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{
    league?: string | string[];
    leagueCursor?: string | string[];
    predictionCursor?: string | string[];
  }>;
}) {
  const { matchId } = await params;
  if (!z.string().uuid().safeParse(matchId).success) notFound();

  const query = await searchParams;
  const leagueCandidate = query.league;
  if (Array.isArray(leagueCandidate)) notFound();
  if (leagueCandidate && !z.string().uuid().safeParse(leagueCandidate).success) notFound();

  const eligibleLeagueCursor = parseOptionalKeysetCursor(query.leagueCursor);
  const revealedPredictionCursor = parseOptionalKeysetCursor(
    query.predictionCursor,
  );

  const { supabase, user } = await requireAuthenticatedUser(`/matches/${matchId}`);

  if (!eligibleLeagueCursor.success || !revealedPredictionCursor.success) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <ErrorState>קישור העמוד אינו תקין.</ErrorState>
        <Link
          href={getMatchHref(matchId, { league: leagueCandidate })}
          className="mt-4 inline-flex min-h-11 items-center rounded-lg px-3 font-bold text-navy-700 underline-offset-4 hover:underline"
        >
          חזרה לעמוד הראשון
        </Link>
      </main>
    );
  }

  const result = await getMatchDetail(supabase, matchId, user.id, {
    requestedLeagueId: leagueCandidate,
    eligibleLeagueCursor: eligibleLeagueCursor.data,
    revealedPredictionCursor: revealedPredictionCursor.data,
  });

  if (result.status === "not-found") notFound();
  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <ErrorState>
          לא ניתן לטעון את המשחק כרגע. יש לרענן ולנסות שוב.
        </ErrorState>
      </main>
    );
  }

  if (result.status === "selection-required") {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-8">
          <p className="text-sm font-bold text-navy-700">מחזור {result.match.roundNumber}</p>
          <h1 className="mt-2 text-2xl font-black text-ink" dir="rtl">
            <IsolatedText>{result.match.homeTeam.name}</IsolatedText>{" "}
            <span aria-hidden="true">–</span>{" "}
            <IsolatedText>{result.match.awayTeam.name}</IsolatedText>
          </h1>
          <h2 className="mt-6 text-lg font-black text-ink">בחירת ליגה לניחוש</h2>
          <p className="mt-2 text-ink-secondary">
            המשחק שייך ליותר מליגה פרטית אחת שלך. הניחוש נשמר בנפרד בכל ליגה.
          </p>
          {result.eligibleLeagues.items.length === 0 ? (
            <p className="mt-4 rounded-xl bg-surface-subtle p-4 text-ink-secondary">
              אין ליגות נוספות בעמוד זה. אפשר לחזור לעמוד הראשון.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3">
            {result.eligibleLeagues.items.map((league) => (
              <li key={league.id}>
                <Link
                  href={`/matches/${matchId}?league=${league.id}`}
                  className="block min-h-11 rounded-lg border border-line px-4 py-3 font-extrabold text-navy-700 hover:bg-navy-100"
                >
                  <IsolatedText>{league.name}</IsolatedText>
                </Link>
              </li>
            ))}
            </ul>
          )}
          <KeysetPagination
            ariaLabel="דפדוף בליגות הזמינות למשחק"
            firstHref={getMatchHref(matchId, {})}
            nextHref={
              result.eligibleLeagues.nextCursor
                ? getMatchHref(matchId, {
                    leagueCursor: result.eligibleLeagues.nextCursor,
                  })
                : null
            }
            hasCurrentCursor={eligibleLeagueCursor.data !== undefined}
          />
        </section>
      </main>
    );
  }

  const data = result.data;
  const locked =
    data.match.predictionsLockedAt !== null ||
    isKickoffLocked(data.match.kickoffAt, data.databaseNow);
  const writable = canWritePrediction({
    leagueStatus: data.league.status,
    status: data.match.status,
    kickoffAt: data.match.kickoffAt,
    predictionsLockedAt: data.match.predictionsLockedAt,
    now: data.databaseNow,
    isActiveMember: true,
  });
  const officialResult =
    data.match.status === "finished" &&
    data.match.homeScore !== null &&
    data.match.awayScore !== null
      ? {
          homeScore: data.match.homeScore,
          awayScore: data.match.awayScore,
        }
      : null;
  const providerReviewLabel = getProviderReviewLabel(
    data.match.providerStatus,
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold text-navy-700">
            <IsolatedText>{data.league.name}</IsolatedText> · מחזור{" "}
            {data.match.roundNumber}
          </p>
          <h1
            className="mt-2 text-3xl font-black tracking-tight text-ink"
            dir="rtl"
          >
            <IsolatedText>{data.match.homeTeam.name}</IsolatedText>{" "}
            <span aria-hidden="true">–</span>{" "}
            <IsolatedText>{data.match.awayTeam.name}</IsolatedText>
          </h1>
        </div>
        <Link
          href={`/leagues/${data.league.id}/matches`}
          className="inline-flex min-h-11 self-start items-center rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-extrabold text-navy-700 hover:bg-navy-100"
        >
          חזרה למשחקי הליגה
        </Link>
      </div>

      {data.eligibleLeagues.items.length > 1 || data.eligibleLeagues.hasMore || eligibleLeagueCursor.data ? (
        <div className="mt-5">
        <nav aria-label="בחירת ליגה" className="flex flex-wrap gap-2">
          {data.eligibleLeagues.items.map((league) => (
            <Link
              key={league.id}
              href={`/matches/${matchId}?league=${league.id}`}
              aria-current={league.id === data.league.id ? "page" : undefined}
              className={`min-h-11 rounded-full px-4 py-2 text-sm font-extrabold ${
                league.id === data.league.id
                  ? "bg-navy-700 text-white"
                  : "border border-line bg-white text-navy-700"
              }`}
            >
              <IsolatedText>{league.name}</IsolatedText>
            </Link>
          ))}
        </nav>
        <KeysetPagination
          ariaLabel="דפדוף בבחירת ליגה"
          firstHref={getMatchHref(matchId, {
            league: data.league.id,
            predictionCursor: query.predictionCursor as string | undefined,
          })}
          nextHref={
            data.eligibleLeagues.nextCursor
              ? getMatchHref(matchId, {
                  league: data.league.id,
                  leagueCursor: data.eligibleLeagues.nextCursor,
                  predictionCursor: query.predictionCursor as string | undefined,
                })
              : null
          }
          hasCurrentCursor={eligibleLeagueCursor.data !== undefined}
        />
        </div>
      ) : null}

      <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-card sm:p-8" aria-labelledby="match-information-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="match-information-title" className="text-xl font-black text-ink">פרטי המשחק</h2>
          <StatusBadge tone={providerReviewLabel ? "warning" : "info"}>
            {providerReviewLabel ?? getMatchStatusLabel(data.match.status)}
          </StatusBadge>
        </div>
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 text-center">
          <IsolatedText className="break-words text-xl font-black text-ink">
            {data.match.homeTeam.name}
          </IsolatedText>
          {officialResult ? (
            <ScorePair
              homeScore={officialResult.homeScore}
              awayScore={officialResult.awayScore}
              label={`תוצאה רשמית: ${data.match.homeTeam.name} ${officialResult.homeScore}, ${data.match.awayTeam.name} ${officialResult.awayScore}`}
              className="pitch-pattern tabular-nums rounded-xl bg-navy-900 px-5 py-3 text-2xl font-black text-white"
            />
          ) : (
            <span
              role="img"
              aria-label="המשחק טרם הסתיים"
              className="text-2xl font-black text-ink-muted"
            >
              –
            </span>
          )}
          <IsolatedText className="break-words text-xl font-black text-ink">
            {data.match.awayTeam.name}
          </IsolatedText>
        </div>
        <dl className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-bold text-ink-secondary">מועד פתיחה מוחלט</dt>
            <dd className="mt-1">
              <LocalDateTime
                instant={data.match.kickoffAt}
                initialText={formatDateTimeInTimeZone(data.match.kickoffAt, DEFAULT_MATCH_TIME_ZONE)}
                initialTimeZone={DEFAULT_MATCH_TIME_ZONE}
              />
            </dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-ink-secondary">מצב נעילה לפי מסד הנתונים</dt>
            <dd className="mt-1">
              {writable ? (
                <LockCountdown
                  initialSeconds={getCountdownSeconds(
                    data.match.kickoffAt,
                    data.databaseNow,
                  )}
                  lockAt={data.match.kickoffAt}
                />
              ) : (
                <span className="font-bold text-ink">
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

      <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-card sm:p-8" aria-labelledby="my-prediction-title">
        <h2 id="my-prediction-title" className="text-xl font-black text-ink">הניחוש שלי</h2>
        {writable ? (
          <div className="mt-5">
            {data.ownPrediction ? (
              <p className="mb-5 rounded-xl bg-surface-subtle p-3 text-sm text-ink-secondary">
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
          <div className="mt-4 rounded-xl bg-surface-subtle p-4">
            <ScorePair
              homeScore={data.ownPrediction.predictedHomeScore}
              awayScore={data.ownPrediction.predictedAwayScore}
              label={`הניחוש שלי: ${data.match.homeTeam.name} ${data.ownPrediction.predictedHomeScore}, ${data.match.awayTeam.name} ${data.ownPrediction.predictedAwayScore}`}
              className="tabular-nums text-2xl font-black text-ink"
            />
            <p className="mt-2 text-sm text-ink-secondary">
              נשמר לאחרונה: {" "}
              <LocalDateTime
                instant={data.ownPrediction.updatedAt}
                initialText={formatDateTimeInTimeZone(data.ownPrediction.updatedAt, DEFAULT_MATCH_TIME_ZONE)}
                initialTimeZone={DEFAULT_MATCH_TIME_ZONE}
              />
            </p>
            <p className="mt-2 font-bold text-ink">
              {locked
                ? "הניחוש נשמר ונעול לעריכה."
                : data.league.status === "completed" || data.league.status === "archived"
                  ? "הניחוש נשמר, והליגה זמינה כעת לקריאה בלבד."
                  : "הניחוש נשמר, אך סטטוס המשחק אינו מאפשר עריכה."}
            </p>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-surface-subtle p-4 text-ink-secondary">
            לא נשמר ניחוש למשחק הזה, וכעת לא ניתן ליצור ניחוש חדש.
          </p>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-card sm:p-8" aria-labelledby="league-predictions-title">
        <h2 id="league-predictions-title" className="text-xl font-black text-ink">ניחושי חברי הליגה</h2>
        {!locked ? (
          <p className="mt-3 rounded-xl border border-navy-200 bg-navy-100 p-4 text-navy-900">
            ניחושי משתתפים אחרים מוסתרים עד מועד הפתיחה. רק הניחוש שלך זמין לך כעת.
          </p>
        ) : data.revealedPredictions.items.length === 0 ? (
          <p className="mt-3 rounded-xl bg-surface-subtle p-4 text-ink-secondary">
            {revealedPredictionCursor.data
              ? "אין ניחושים נוספים בעמוד זה. אפשר לחזור לעמוד הראשון."
              : "לא הוגשו ניחושים למשחק."}
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.revealedPredictions.items.map((prediction) => (
              <li key={prediction.id} className="flex items-center justify-between gap-4 rounded-xl bg-surface-subtle p-4">
                <span className="min-w-0 break-words font-bold text-ink">
                  <IsolatedText>{prediction.displayName}</IsolatedText>
                  {prediction.isViewer ? " (אני)" : ""}
                </span>
                <ScorePair
                  homeScore={prediction.predictedHomeScore}
                  awayScore={prediction.predictedAwayScore}
                  label={`הניחוש של ${prediction.displayName}: ${data.match.homeTeam.name} ${prediction.predictedHomeScore}, ${data.match.awayTeam.name} ${prediction.predictedAwayScore}`}
                  className="tabular-nums shrink-0 text-xl font-black text-ink"
                />
              </li>
            ))}
          </ul>
        )}
        {locked ? (
          <KeysetPagination
            ariaLabel="דפדוף בניחושי חברי הליגה"
            firstHref={getMatchHref(matchId, {
              league: data.league.id,
              leagueCursor: query.leagueCursor as string | undefined,
            })}
            nextHref={
              data.revealedPredictions.nextCursor
                ? getMatchHref(matchId, {
                    league: data.league.id,
                    leagueCursor: query.leagueCursor as string | undefined,
                    predictionCursor: data.revealedPredictions.nextCursor,
                  })
                : null
            }
            hasCurrentCursor={revealedPredictionCursor.data !== undefined}
          />
        ) : null}
      </section>
    </main>
  );
}
