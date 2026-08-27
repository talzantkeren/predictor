import Link from "next/link";

import { IsolatedText } from "@/components/ui/isolated-text";
import { StatusBadge } from "@/components/ui/status-badge";
import { LocalDateTime } from "@/features/predictions/components/local-date-time";
import { LockCountdown } from "@/features/predictions/components/lock-countdown";
import { ScorePair } from "@/features/predictions/components/score-pair";
import {
  canWritePrediction,
  DEFAULT_MATCH_TIME_ZONE,
  derivePredictionDisplayState,
  formatDateTimeInTimeZone,
  getCountdownSeconds,
  getMatchStatusLabel,
  getPredictionStateLabel,
  getProviderReviewLabel,
  type PredictionDisplayState,
} from "@/features/predictions/display";
import type {
  LeagueMatchItem,
  LeagueStatus,
} from "@/features/predictions/types";

function getMatchTone(match: LeagueMatchItem, requiresReview: boolean) {
  if (requiresReview || match.status === "postponed") return "warning" as const;
  if (match.status === "canceled") return "error" as const;
  if (match.status === "live") return "info" as const;
  if (match.status === "finished") return "neutral" as const;
  return "info" as const;
}

function getPredictionTone(state: PredictionDisplayState) {
  if (state === "editable" || state === "saved") return "success" as const;
  if (state === "locked" || state === "unavailable") return "locked" as const;
  return "info" as const;
}

export function MatchRow({
  leagueId,
  leagueStatus,
  match,
  databaseNow,
  viewerIsActiveMember,
}: {
  leagueId: string;
  leagueStatus: LeagueStatus;
  match: LeagueMatchItem;
  databaseNow: string;
  viewerIsActiveMember: boolean;
}) {
  const providerReviewLabel = getProviderReviewLabel(match.providerStatus);
  const displayState = derivePredictionDisplayState({
    leagueStatus,
    status: match.status,
    kickoffAt: match.kickoffAt,
    predictionsLockedAt: match.predictionsLockedAt,
    now: databaseNow,
    isActiveMember: viewerIsActiveMember,
    hasPrediction: match.ownPrediction !== null,
  });
  const writable = canWritePrediction({
    leagueStatus,
    status: match.status,
    kickoffAt: match.kickoffAt,
    predictionsLockedAt: match.predictionsLockedAt,
    now: databaseNow,
    isActiveMember: viewerIsActiveMember,
  });
  const officialResult =
    match.status === "finished" &&
    match.homeScore !== null &&
    match.awayScore !== null
      ? { homeScore: match.homeScore, awayScore: match.awayScore }
      : null;

  return (
    <li
      className="grid min-w-0 gap-4 border-t border-line px-4 py-5 first:border-t-0 sm:px-6 lg:grid-cols-[11rem_minmax(0,1fr)_12rem] lg:items-center"
      data-match-id={match.id}
    >
      <div className="flex min-w-0 flex-wrap items-start gap-2 lg:flex-col">
        <StatusBadge
          tone={getMatchTone(match, providerReviewLabel !== null)}
          symbol={match.status === "finished" ? "◆" : undefined}
        >
          {providerReviewLabel ?? getMatchStatusLabel(match.status)}
        </StatusBadge>
        <div className="min-w-0 text-xs leading-5 text-ink-muted">
          <LocalDateTime
            instant={match.kickoffAt}
            initialText={formatDateTimeInTimeZone(
              match.kickoffAt,
              DEFAULT_MATCH_TIME_ZONE,
            )}
            initialTimeZone={DEFAULT_MATCH_TIME_ZONE}
          />
        </div>
      </div>

      <div className="min-w-0">
        <h3
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-center text-base font-black text-ink sm:text-lg"
          dir="rtl"
        >
          <IsolatedText className="min-w-0 break-words">
            {match.homeTeam.name}
          </IsolatedText>
          <span aria-hidden="true" className="text-ink-muted">
            –
          </span>
          <IsolatedText className="min-w-0 break-words">
            {match.awayTeam.name}
          </IsolatedText>
        </h3>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          {officialResult ? (
            <ScorePair
              homeScore={officialResult.homeScore}
              awayScore={officialResult.awayScore}
              label={`תוצאה רשמית: ${match.homeTeam.name} ${officialResult.homeScore}, ${match.awayTeam.name} ${officialResult.awayScore}`}
              className="pitch-pattern tabular-nums rounded-lg bg-navy-900 px-4 py-2 text-xl font-black text-white"
            />
          ) : null}
          {match.ownPrediction ? (
            <span className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 font-black text-navy-900">
              <span aria-hidden="true">הניחוש שלי:</span>
              <ScorePair
                homeScore={match.ownPrediction.predictedHomeScore}
                awayScore={match.ownPrediction.predictedAwayScore}
                label={`הניחוש שלי: ${match.homeTeam.name} ${match.ownPrediction.predictedHomeScore}, ${match.awayTeam.name} ${match.ownPrediction.predictedAwayScore}`}
                className="tabular-nums"
              />
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-col items-start gap-3 lg:items-stretch">
        <StatusBadge tone={getPredictionTone(displayState)}>
          {getPredictionStateLabel(displayState)}
        </StatusBadge>
        {writable ? (
          <div className="text-xs leading-5 text-ink-secondary">
            <span className="block font-bold">נעילה לפי זמן מסד הנתונים</span>
            <LockCountdown
              initialSeconds={getCountdownSeconds(match.kickoffAt, databaseNow)}
              lockAt={match.kickoffAt}
            />
          </div>
        ) : null}
        {viewerIsActiveMember ? (
          <Link
            href={`/matches/${match.id}?league=${leagueId}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-action px-4 py-2 text-sm font-extrabold text-white transition hover:bg-action-hover"
          >
            פתיחת המשחק והניחוש
          </Link>
        ) : null}
      </div>
    </li>
  );
}
