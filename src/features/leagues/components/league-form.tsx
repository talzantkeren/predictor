"use client";

import { useActionState, useState } from "react";

import { FieldError, FormMessage } from "@/features/auth/components/form-message";
import {
  createLeagueAction,
  type LeagueActionState,
} from "@/features/leagues/actions";
import type { SeasonOption } from "@/features/leagues/types";

type PrizeRow = { key: number };

export function LeagueForm({ seasons }: { seasons: SeasonOption[] }) {
  const initialState: LeagueActionState = { status: "idle" };
  const [state, formAction, pending] = useActionState(
    createLeagueAction,
    initialState,
  );
  const [prizeRows, setPrizeRows] = useState<PrizeRow[]>([{ key: 1 }]);
  const [nextPrizeKey, setNextPrizeKey] = useState(2);

  function addPrizeRow() {
    setPrizeRows((rows) => [...rows, { key: nextPrizeKey }]);
    setNextPrizeKey((value) => value + 1);
  }

  function removePrizeRow(key: number) {
    setPrizeRows((rows) => rows.filter((row) => row.key !== key));
  }

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {state.message ? <FormMessage kind="error">{state.message}</FormMessage> : null}

      <div className="grid min-w-0 gap-5 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2">
          <label htmlFor="league-name" className="block text-sm font-semibold text-slate-800">
            שם הליגה
          </label>
          <input
            id="league-name"
            name="name"
            type="text"
            required
            minLength={3}
            maxLength={80}
            autoComplete="off"
            aria-invalid={Boolean(state.fieldErrors?.name)}
            aria-describedby={
              state.fieldErrors?.name
                ? "league-name-error league-name-help"
                : "league-name-help"
            }
            className="mt-2 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
          />
          <p id="league-name-help" className="mt-1 text-sm text-slate-500">
            בין 3 ל־80 תווים.
          </p>
          <FieldError id="league-name-error" messages={state.fieldErrors?.name} />
        </div>

        <div className="min-w-0 sm:col-span-2">
          <label htmlFor="league-description" className="block text-sm font-semibold text-slate-800">
            תיאור <span className="font-normal text-slate-500">(אופציונלי)</span>
          </label>
          <textarea
            id="league-description"
            name="description"
            rows={4}
            maxLength={500}
            aria-invalid={Boolean(state.fieldErrors?.description)}
            aria-describedby={
              state.fieldErrors?.description
                ? "league-description-error league-description-help"
                : "league-description-help"
            }
            className="mt-2 w-full min-w-0 resize-y rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
          />
          <p id="league-description-help" className="mt-1 text-sm text-slate-500">
            עד 500 תווים.
          </p>
          <FieldError id="league-description-error" messages={state.fieldErrors?.description} />
        </div>

        <div className="min-w-0">
          <label htmlFor="league-season" className="block text-sm font-semibold text-slate-800">
            עונה
          </label>
          <select
            id="league-season"
            name="seasonId"
            required
            defaultValue={seasons[0]?.id ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.seasonId)}
            aria-describedby={state.fieldErrors?.seasonId ? "league-season-error" : undefined}
            className="mt-2 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
          >
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.competitionName} — {season.name}
              </option>
            ))}
          </select>
          <FieldError id="league-season-error" messages={state.fieldErrors?.seasonId} />
        </div>

        <div className="min-w-0">
          <label htmlFor="demo-entry-fee" className="block text-sm font-semibold text-slate-800">
            סכום השתתפות Demo באגורות
          </label>
          <input
            id="demo-entry-fee"
            name="demoEntryFeeAgorot"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            required
            defaultValue="0"
            aria-invalid={Boolean(state.fieldErrors?.demoEntryFeeAgorot)}
            aria-describedby={
              state.fieldErrors?.demoEntryFeeAgorot
                ? "demo-entry-fee-error demo-entry-fee-help"
                : "demo-entry-fee-help"
            }
            className="mt-2 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
          />
          <p id="demo-entry-fee-help" className="mt-1 text-sm text-slate-500">
            לדוגמה: 2500 מייצג ₪25.00 לצורכי הדגמה בלבד.
          </p>
          <FieldError id="demo-entry-fee-error" messages={state.fieldErrors?.demoEntryFeeAgorot} />
        </div>

        <div className="min-w-0 sm:col-span-2">
          <label htmlFor="demo-payment-instructions" className="block text-sm font-semibold text-slate-800">
            הוראות Demo <span className="font-normal text-slate-500">(אופציונלי)</span>
          </label>
          <textarea
            id="demo-payment-instructions"
            name="demoPaymentInstructions"
            rows={3}
            maxLength={500}
            placeholder="לדוגמה: סמנו ידנית שהשלמתם את שלב ההדגמה."
            aria-invalid={Boolean(state.fieldErrors?.demoPaymentInstructions)}
            aria-describedby={
              state.fieldErrors?.demoPaymentInstructions
                ? "demo-payment-instructions-error demo-payment-instructions-help"
                : "demo-payment-instructions-help"
            }
            className="mt-2 w-full min-w-0 resize-y rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
          />
          <p id="demo-payment-instructions-help" className="mt-1 text-sm text-slate-500">
            טקסט בלבד, ללא קישור תשלום וללא העברת כסף אמיתי.
          </p>
          <FieldError id="demo-payment-instructions-error" messages={state.fieldErrors?.demoPaymentInstructions} />
        </div>
      </div>

      <fieldset className="rounded-xl border border-slate-200 p-4 sm:p-5">
        <legend className="px-2 text-lg font-bold text-slate-900">חוקי ניקוד</legend>
        <p className="mb-4 text-sm leading-6 text-slate-600">
          ברירת המחדל היא 3/1/0. הערכים נשמרים לכל ליגה וננעלים בתחילת המשחק הראשון בעונה.
        </p>
        <div className="grid min-w-0 gap-4 sm:grid-cols-3">
          {[
            ["exactPoints", "תוצאה מדויקת", "3", "scoring.exactPoints"],
            ["correctOutcomePoints", "כיוון נכון", "1", "scoring.correctOutcomePoints"],
            ["incorrectPoints", "כיוון שגוי", "0", "scoring.incorrectPoints"],
          ].map(([name, label, defaultValue, errorKey]) => (
            <div key={name} className="min-w-0">
              <label htmlFor={name} className="block text-sm font-semibold text-slate-800">
                {label}
              </label>
              <input
                id={name}
                name={name}
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                required
                defaultValue={defaultValue}
                aria-invalid={Boolean(state.fieldErrors?.[errorKey])}
                aria-describedby={state.fieldErrors?.[errorKey] ? `${name}-error` : undefined}
                className="mt-2 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
              />
              <FieldError id={`${name}-error`} messages={state.fieldErrors?.[errorKey]} />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset
        aria-describedby="league-prizes-help"
        className="rounded-xl border border-slate-200 p-4 sm:p-5"
      >
        <legend className="px-2 text-lg font-bold text-slate-900">חלוקת פרסי Demo</legend>
        <p id="league-prizes-help" className="mb-4 text-sm leading-6 text-slate-600">
          המיקומים נקבעים אוטומטית לפי סדר השורות ומתחילים ב־1. סכום האחוזים חייב
          להיות 100% בדיוק.
        </p>

        <div className="space-y-4">
          {prizeRows.map((row, index) => {
            const positionError = state.fieldErrors?.[`prizes.${index}.position`];
            const percentageError = state.fieldErrors?.[`prizes.${index}.percentageBps`];

            return (
              <div key={row.key} className="grid min-w-0 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div className="min-w-0">
                  <label htmlFor={`prize-position-${row.key}`} className="block text-sm font-semibold text-slate-800">
                    מיקום
                  </label>
                  {/* Positions derive from row order, so removing a middle row
                      always leaves a consecutive 1..N set. */}
                  <input
                    id={`prize-position-${row.key}`}
                    name="prizePosition"
                    type="number"
                    inputMode="numeric"
                    value={index + 1}
                    readOnly
                    aria-invalid={Boolean(positionError)}
                    aria-describedby={positionError ? `prize-position-${row.key}-error` : undefined}
                    className="mt-2 w-full min-w-0 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2.5 text-slate-700 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
                  />
                  <FieldError id={`prize-position-${row.key}-error`} messages={positionError} />
                </div>

                <div className="min-w-0">
                  <label htmlFor={`prize-percentage-${row.key}`} className="block text-sm font-semibold text-slate-800">
                    אחוז
                  </label>
                  <input
                    id={`prize-percentage-${row.key}`}
                    name="prizePercentage"
                    type="text"
                    inputMode="decimal"
                    required
                    defaultValue={index === 0 ? "100" : ""}
                    placeholder="0.00"
                    aria-invalid={Boolean(percentageError)}
                    aria-describedby={percentageError ? `prize-percentage-${row.key}-error` : undefined}
                    className="mt-2 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
                  />
                  <FieldError id={`prize-percentage-${row.key}-error`} messages={percentageError} />
                </div>

                <button
                  type="button"
                  onClick={() => removePrizeRow(row.key)}
                  disabled={prizeRows.length === 1}
                  aria-label={`הסרת מיקום פרס ${index + 1}`}
                  className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  הסרה
                </button>
              </div>
            );
          })}
        </div>

        <FieldError
          id="prizes-error"
          alert
          messages={state.fieldErrors?.prizes ?? state.fieldErrors?.form}
        />

        <button
          type="button"
          onClick={addPrizeRow}
          disabled={prizeRows.length >= 100}
          className="mt-4 rounded-lg border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-50"
        >
          הוספת מיקום פרס
        </button>
      </fieldset>

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
        <input
          name="allowLateJoin"
          type="checkbox"
          defaultChecked
          className="mt-1 size-4 accent-blue-700"
        />
        <span>
          <span className="block font-semibold text-slate-900">לאפשר הצטרפות מאוחרת</span>
          <span className="mt-1 block text-sm leading-6 text-slate-600">
            חברים שיצטרפו מאוחר לא יקבלו נקודות רטרואקטיביות.
          </span>
        </span>
      </label>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="note">
        <strong>מצב Demo בלבד:</strong> הסכומים וחלוקת הפרסים הם סימולציה. האפליקציה אינה גובה, מחזיקה או מעבירה כסף.
      </div>

      <button
        type="submit"
        disabled={pending || seasons.length === 0}
        className="w-full rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
      >
        {pending ? "יוצרים את הליגה..." : "יצירת ליגה"}
      </button>
    </form>
  );
}
