import { LocalDateTime } from "@/features/predictions/components/local-date-time";
import { MatchRow } from "@/features/predictions/components/match-row";
import {
  DEFAULT_MATCH_TIME_ZONE,
  formatDateTimeInTimeZone,
} from "@/features/predictions/display";
import type { LeagueRoundGroup } from "@/features/predictions/round-groups";
import type { LeagueStatus } from "@/features/predictions/types";

export function RoundCard({
  leagueId,
  leagueStatus,
  group,
  databaseNow,
  viewerIsActiveMember,
  progressScope,
}: {
  leagueId: string;
  leagueStatus: LeagueStatus;
  group: LeagueRoundGroup;
  databaseNow: string;
  viewerIsActiveMember: boolean;
  progressScope: "round" | "visible";
}) {
  const firstKickoff = group.matches[0]?.kickoffAt;
  const submittedText =
    group.predictionsSubmitted === 0
      ? `טרם נשמרו ניחושים מתוך ${group.matches.length} משחקים`
      : group.predictionsSubmitted === 1
        ? `נשמר ניחוש אחד מתוך ${group.matches.length} משחקים`
        : `נשמרו ${group.predictionsSubmitted} ניחושים מתוך ${group.matches.length} משחקים`;

  return (
    <article
      id={`round-${group.roundNumber}`}
      className="scroll-mt-6 overflow-hidden rounded-2xl border border-line bg-white shadow-card"
      aria-labelledby={`round-${group.roundNumber}-title`}
    >
      <header className="grid gap-4 border-b border-line px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <h2
            id={`round-${group.roundNumber}-title`}
            className="text-2xl font-black text-ink"
          >
            מחזור {group.roundNumber}
          </h2>
          {firstKickoff ? (
            <p className="mt-1 text-sm leading-6 text-ink-secondary">
              נעילה ראשונה לפי מועד המשחק: {" "}
              <LocalDateTime
                instant={firstKickoff}
                initialText={formatDateTimeInTimeZone(
                  firstKickoff,
                  DEFAULT_MATCH_TIME_ZONE,
                )}
                initialTimeZone={DEFAULT_MATCH_TIME_ZONE}
              />
            </p>
          ) : null}
        </div>

        {viewerIsActiveMember ? (
          <div className="min-w-0 lg:w-72">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-extrabold text-success-900">
              <span>
                {submittedText}
              </span>
              {progressScope === "visible" ? (
                <span className="text-xs font-bold text-ink-muted">
                  מהמשחקים המוצגים
                </span>
              ) : null}
            </div>
            <div
              className="mt-2 grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${Math.max(group.matches.length, 1)}, minmax(0, 1fr))`,
              }}
              aria-hidden="true"
            >
              {group.matches.map((match, index) => (
                <span
                  key={match.id}
                  aria-hidden="true"
                  className={`h-1.5 rounded-full ${
                    index < group.predictionsSubmitted
                      ? "bg-action"
                      : "bg-control-border"
                  }`}
                />
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <ol>
        {group.matches.map((match) => (
          <MatchRow
            key={match.id}
            leagueId={leagueId}
            leagueStatus={leagueStatus}
            match={match}
            databaseNow={databaseNow}
            viewerIsActiveMember={viewerIsActiveMember}
          />
        ))}
      </ol>
    </article>
  );
}
