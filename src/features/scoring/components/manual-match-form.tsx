"use client";

import { useActionState, useEffect, useState } from "react";

import type {
  ManualMatchActionState,
  ManualMatchFormAction,
} from "@/features/scoring/manual-match-action-state";
import type {
  SystemMatchEditorCatalog,
  SystemMatchItem,
} from "@/features/scoring/types";

const initialState: ManualMatchActionState = { status: "idle" };

function utcMinute(instant: string) {
  return new Date(instant).toISOString().slice(0, 16);
}

function FieldError({
  id,
  messages,
}: {
  id: string;
  messages: string[] | undefined;
}) {
  return messages?.[0] ? (
    <p id={id} className="mt-1 text-sm font-semibold text-error-900">
      {messages[0]}
    </p>
  ) : null;
}

export function ManualMatchForm({
  action,
  catalog,
  match,
  observedMatchId,
}: {
  action: ManualMatchFormAction;
  catalog: SystemMatchEditorCatalog;
  match?: SystemMatchItem;
  observedMatchId: string;
}) {
  const operation = match ? "correct" : "create";

  const [selectedStatus, setSelectedStatus] = useState(
    match?.status ?? "scheduled",
  );
  const [seasonId, setSeasonId] = useState(
    match?.seasonId ?? catalog.seasons[0]?.id ?? "",
  );
  const [roundNumber, setRoundNumber] = useState(
    String(match?.roundNumber ?? 1),
  );
  const [kickoffAt, setKickoffAt] = useState(
    match ? utcMinute(match.kickoffAt) : "",
  );
  const initialKickoffAt = match ? utcMinute(match.kickoffAt) : "";
  const [homeTeamId, setHomeTeamId] = useState(
    match?.homeTeamId ?? catalog.teams[0]?.id ?? "",
  );
  const [awayTeamId, setAwayTeamId] = useState(
    match?.awayTeamId ?? catalog.teams[1]?.id ?? "",
  );
  const [homeScore, setHomeScore] = useState(
    match?.homeScore === null || match?.homeScore === undefined
      ? ""
      : String(match.homeScore),
  );
  const [awayScore, setAwayScore] = useState(
    match?.awayScore === null || match?.awayScore === undefined
      ? ""
      : String(match.awayScore),
  );
  const [state, formAction, pending] = useActionState(
    action,
    initialState,
  );
  const prefix = `${operation}-${observedMatchId}`;
  const isFinished = selectedStatus === "finished";

  useEffect(() => {
    if (state.status !== "error" || !state.fieldErrors) return;
    const fieldSuffixes = [
      ["seasonId", "season"],
      ["roundNumber", "round"],
      ["kickoffAt", "kickoff"],
      ["homeTeamId", "home-team"],
      ["awayTeamId", "away-team"],
      ["status", "status"],
      ["homeScore", "home-score"],
      ["awayScore", "away-score"],
    ] as const;
    const firstInvalid = fieldSuffixes.find(
      ([field]) => state.fieldErrors?.[field]?.length,
    );
    if (firstInvalid) {
      document.getElementById(`${prefix}-${firstInvalid[1]}`)?.focus();
    }
  }, [prefix, state]);

  return (
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      data-manual-match-id={observedMatchId}
      className="mt-5 border-t border-line pt-5"
    >
      <input
        type="hidden"
        name="kickoffAt"
        value={match && kickoffAt === initialKickoffAt ? match.kickoffAt : kickoffAt}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor={`${prefix}-season`} className="text-sm font-bold text-ink">
            עונה קיימת
          </label>
          <select
            id={`${prefix}-season`}
            name="seasonId"
            required
            value={seasonId}
            onChange={(event) => setSeasonId(event.target.value)}
            aria-invalid={state.fieldErrors?.seasonId ? true : undefined}
            aria-describedby={
              state.fieldErrors?.seasonId ? `${prefix}-season-error` : undefined
            }
            className="mt-1 block w-full rounded-lg border border-control-border bg-white px-3 py-2.5 focus:border-focus focus:outline-none focus:ring-2 focus:ring-navy-200"
          >
            {catalog.seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.competitionName} — {season.name}
              </option>
            ))}
          </select>
          <FieldError
            id={`${prefix}-season-error`}
            messages={state.fieldErrors?.seasonId}
          />
        </div>

        <div>
          <label htmlFor={`${prefix}-round`} className="text-sm font-bold text-ink">
            מחזור
          </label>
          <input
            id={`${prefix}-round`}
            name="roundNumber"
            type="number"
            min="1"
            max="1000"
            step="1"
            inputMode="numeric"
            required
            value={roundNumber}
            onChange={(event) => setRoundNumber(event.target.value)}
            aria-invalid={state.fieldErrors?.roundNumber ? true : undefined}
            aria-describedby={
              state.fieldErrors?.roundNumber ? `${prefix}-round-error` : undefined
            }
            className="mt-1 block w-full rounded-lg border border-control-border bg-white px-3 py-2.5 focus:border-focus focus:outline-none focus:ring-2 focus:ring-navy-200"
          />
          <FieldError
            id={`${prefix}-round-error`}
            messages={state.fieldErrors?.roundNumber}
          />
        </div>

        <div>
          <label htmlFor={`${prefix}-kickoff`} className="text-sm font-bold text-ink">
            מועד פתיחה (UTC)
          </label>
          <input
            id={`${prefix}-kickoff`}
            type="datetime-local"
            step="60"
            required
            value={kickoffAt}
            onChange={(event) => setKickoffAt(event.target.value)}
            aria-invalid={state.fieldErrors?.kickoffAt ? true : undefined}
            aria-describedby={
              state.fieldErrors?.kickoffAt
                ? `${prefix}-kickoff-error`
                : undefined
            }
            className="mt-1 block w-full rounded-lg border border-control-border bg-white px-3 py-2.5 focus:border-focus focus:outline-none focus:ring-2 focus:ring-navy-200"
          />
          <FieldError
            id={`${prefix}-kickoff-error`}
            messages={state.fieldErrors?.kickoffAt}
          />
          <p className="mt-1 text-xs leading-5 text-slate-500">
            הספרות מפורשות ישירות כשעת UTC, ללא המרת אזור הזמן של הדפדפן.
          </p>
        </div>

        <div>
          <label htmlFor={`${prefix}-home-team`} className="text-sm font-bold text-ink">
            קבוצת בית קיימת
          </label>
          <select
            id={`${prefix}-home-team`}
            name="homeTeamId"
            required
            value={homeTeamId}
            onChange={(event) => setHomeTeamId(event.target.value)}
            aria-invalid={state.fieldErrors?.homeTeamId ? true : undefined}
            aria-describedby={
              state.fieldErrors?.homeTeamId
                ? `${prefix}-home-team-error`
                : undefined
            }
            className="mt-1 block w-full rounded-lg border border-control-border bg-white px-3 py-2.5 focus:border-focus focus:outline-none focus:ring-2 focus:ring-navy-200"
          >
            {catalog.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <FieldError
            id={`${prefix}-home-team-error`}
            messages={state.fieldErrors?.homeTeamId}
          />
        </div>

        <div>
          <label htmlFor={`${prefix}-away-team`} className="text-sm font-bold text-ink">
            קבוצת חוץ קיימת
          </label>
          <select
            id={`${prefix}-away-team`}
            name="awayTeamId"
            required
            value={awayTeamId}
            onChange={(event) => setAwayTeamId(event.target.value)}
            aria-invalid={state.fieldErrors?.awayTeamId ? true : undefined}
            aria-describedby={
              state.fieldErrors?.awayTeamId
                ? `${prefix}-away-team-error`
                : undefined
            }
            className="mt-1 block w-full rounded-lg border border-control-border bg-white px-3 py-2.5 focus:border-focus focus:outline-none focus:ring-2 focus:ring-navy-200"
          >
            {catalog.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <FieldError
            id={`${prefix}-away-team-error`}
            messages={state.fieldErrors?.awayTeamId}
          />
        </div>

        <div>
          <label htmlFor={`${prefix}-status`} className="text-sm font-bold text-ink">
            מצב משחק
          </label>
          <select
            id={`${prefix}-status`}
            name="status"
            value={selectedStatus}
            aria-invalid={state.fieldErrors?.status ? true : undefined}
            aria-describedby={
              state.fieldErrors?.status ? `${prefix}-status-error` : undefined
            }
            onChange={(event) =>
              setSelectedStatus(
                event.target.value as SystemMatchItem["status"],
              )
            }
            className="mt-1 block w-full rounded-lg border border-control-border bg-white px-3 py-2.5 focus:border-focus focus:outline-none focus:ring-2 focus:ring-navy-200"
          >
            <option value="scheduled">מתוכנן</option>
            <option value="live">מתקיים</option>
            <option value="finished">הסתיים</option>
            <option value="postponed">נדחה</option>
            <option value="canceled">בוטל</option>
          </select>
          <FieldError
            id={`${prefix}-status-error`}
            messages={state.fieldErrors?.status}
          />
        </div>

        <div>
          <label htmlFor={`${prefix}-home-score`} className="text-sm font-bold text-ink">
            שערי קבוצת הבית
          </label>
          <input
            id={`${prefix}-home-score`}
            name="homeScore"
            type="number"
            min="0"
            max="30"
            step="1"
            inputMode="numeric"
            required={isFinished}
            disabled={!isFinished}
            value={homeScore}
            onChange={(event) => setHomeScore(event.target.value)}
            aria-label={
              match ? `שערי ${match.homeTeamName}` : "שערי קבוצת הבית"
            }
            aria-invalid={state.fieldErrors?.homeScore ? true : undefined}
            aria-describedby={
              state.fieldErrors?.homeScore
                ? `${prefix}-home-score-error`
                : undefined
            }
            className="mt-1 block w-full rounded-lg border border-control-border bg-white px-3 py-2.5 disabled:bg-locked-50 focus:border-focus focus:outline-none focus:ring-2 focus:ring-navy-200"
          />
          <FieldError
            id={`${prefix}-home-score-error`}
            messages={state.fieldErrors?.homeScore}
          />
        </div>

        <div>
          <label htmlFor={`${prefix}-away-score`} className="text-sm font-bold text-ink">
            שערי קבוצת החוץ
          </label>
          <input
            id={`${prefix}-away-score`}
            name="awayScore"
            type="number"
            min="0"
            max="30"
            step="1"
            inputMode="numeric"
            required={isFinished}
            disabled={!isFinished}
            value={awayScore}
            onChange={(event) => setAwayScore(event.target.value)}
            aria-label={
              match ? `שערי ${match.awayTeamName}` : "שערי קבוצת החוץ"
            }
            aria-invalid={state.fieldErrors?.awayScore ? true : undefined}
            aria-describedby={
              state.fieldErrors?.awayScore
                ? `${prefix}-away-score-error`
                : undefined
            }
            className="mt-1 block w-full rounded-lg border border-control-border bg-white px-3 py-2.5 disabled:bg-locked-50 focus:border-focus focus:outline-none focus:ring-2 focus:ring-navy-200"
          />
          <FieldError
            id={`${prefix}-away-score-error`}
            messages={state.fieldErrors?.awayScore}
          />
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">
        שמירה דרך מסלול זה מסמנת בעלות ידנית מפורשת. שינוי עונה או קבוצות
        נחסם לאחר ניחוש או נעילה, וזהות ספק קיימת נשמרת.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-action px-4 py-2.5 text-sm font-extrabold text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending
            ? "שומר משחק..."
            : operation === "create"
              ? "יצירת משחק ידני"
              : match?.resultVersion
                ? "עדכון תוצאה"
                : "שמירת תוצאה"}
        </button>
        {state.message ? (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={
              state.status === "error"
                ? "text-sm font-bold text-error-900"
                : "text-sm font-bold text-success-900"
            }
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
