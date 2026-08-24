"use client";

import { useActionState, useState } from "react";

import {
  applyManualResult,
  type ManualResultActionState,
} from "@/features/scoring/actions";
import type { SystemMatchItem } from "@/features/scoring/types";

const initialState: ManualResultActionState = { status: "idle" };

export function ManualResultForm({ match }: { match: SystemMatchItem }) {
  const initialStatus = match.status === "canceled" ? "canceled" : "finished";
  const [selectedStatus, setSelectedStatus] = useState<
    "finished" | "canceled"
  >(initialStatus);
  const [state, formAction, pending] = useActionState(
    applyManualResult,
    initialState,
  );
  const homeInputId = `home-score-${match.id}`;
  const awayInputId = `away-score-${match.id}`;
  const statusInputId = `result-status-${match.id}`;

  return (
    <form action={formAction} className="mt-5 border-t border-slate-200 pt-5">
      <input type="hidden" name="matchId" value={match.id} />

      <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
        <div>
          <label htmlFor={statusInputId} className="text-sm font-bold text-ink">
            מצב תוצאה
          </label>
          <select
            id={statusInputId}
            name="status"
            value={selectedStatus}
            onChange={(event) =>
              setSelectedStatus(event.target.value as "finished" | "canceled")
            }
            className="mt-1 block w-full rounded-lg border border-control-border bg-white px-3 py-2.5 focus:border-focus focus:outline-none focus:ring-2 focus:ring-navy-200"
          >
            <option value="finished">הסתיים</option>
            <option value="canceled">בוטל</option>
          </select>
        </div>

        <div>
          <label htmlFor={homeInputId} className="text-sm font-bold text-ink">
            שערי {match.homeTeamName}
          </label>
          <input
            id={homeInputId}
            name="homeScore"
            type="number"
            min="0"
            max="30"
            step="1"
            inputMode="numeric"
            required={selectedStatus === "finished"}
            disabled={selectedStatus === "canceled"}
            defaultValue={match.homeScore ?? ""}
            aria-invalid={state.fieldErrors?.homeScore ? true : undefined}
            aria-describedby={
              state.fieldErrors?.homeScore ? `${homeInputId}-error` : undefined
            }
            className="mt-1 block w-full rounded-lg border border-control-border px-3 py-2.5 disabled:bg-locked-50 focus:border-focus focus:outline-none focus:ring-2 focus:ring-navy-200"
          />
          {state.fieldErrors?.homeScore?.[0] ? (
            <p id={`${homeInputId}-error`} className="mt-1 text-sm text-red-700">
              {state.fieldErrors.homeScore[0]}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor={awayInputId} className="text-sm font-bold text-ink">
            שערי {match.awayTeamName}
          </label>
          <input
            id={awayInputId}
            name="awayScore"
            type="number"
            min="0"
            max="30"
            step="1"
            inputMode="numeric"
            required={selectedStatus === "finished"}
            disabled={selectedStatus === "canceled"}
            defaultValue={match.awayScore ?? ""}
            aria-invalid={state.fieldErrors?.awayScore ? true : undefined}
            aria-describedby={
              state.fieldErrors?.awayScore ? `${awayInputId}-error` : undefined
            }
            className="mt-1 block w-full rounded-lg border border-control-border px-3 py-2.5 disabled:bg-locked-50 focus:border-focus focus:outline-none focus:ring-2 focus:ring-navy-200"
          />
          {state.fieldErrors?.awayScore?.[0] ? (
            <p id={`${awayInputId}-error`} className="mt-1 text-sm text-red-700">
              {state.fieldErrors.awayScore[0]}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          {pending
            ? "שומר תוצאה..."
            : match.resultVersion > 0
              ? "עדכון תוצאה"
              : "שמירת תוצאה"}
        </button>
        {state.message ? (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={
              state.status === "error"
                ? "text-sm font-medium text-red-700"
                : "text-sm font-medium text-emerald-700"
            }
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
