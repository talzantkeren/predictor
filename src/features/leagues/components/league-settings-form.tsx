"use client";

import { useActionState, useState } from "react";

import { FieldError, FormMessage } from "@/features/auth/components/form-message";
import {
  updateLeagueSettingsAction,
  type LeagueSettingsActionState,
} from "@/features/leagues/actions";
import {
  areLeagueRulesEffectivelyLocked,
  formatUtcDateTimeLocalValue,
  type EditableLeagueSettings,
} from "@/features/leagues/settings-types";

type PrizeRow = {
  key: number;
  percentage: string;
};

type SettingsDraft = {
  name: string;
  description: string;
  demoEntryFeeAgorot: string;
  joinsCloseAt: string;
  demoPaymentInstructions: string;
  allowLateJoin: boolean;
  exactPoints: string;
  correctOutcomePoints: string;
  incorrectPoints: string;
};

function percentageBpsToInputValue(basisPoints: number) {
  const whole = Math.floor(basisPoints / 100);
  const fraction = basisPoints % 100;

  if (fraction === 0) {
    return String(whole);
  }

  return `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}

function formatUtcDateTime(value: string) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function LeagueSettingsForm({
  settings,
}: {
  settings: EditableLeagueSettings;
}) {
  const initialState: LeagueSettingsActionState = {
    status: "idle",
    settingsVersion: settings.settingsVersion,
    scoringVersion: settings.scoring.version,
  };
  const [state, formAction, pending] = useActionState(
    updateLeagueSettingsAction,
    initialState,
  );
  const [draft, setDraft] = useState<SettingsDraft>(() => ({
    name: settings.name,
    description: settings.description ?? "",
    demoEntryFeeAgorot: String(settings.demoEntryFeeAgorot),
    joinsCloseAt: formatUtcDateTimeLocalValue(settings.joinsCloseAt),
    demoPaymentInstructions: settings.demoPaymentInstructions ?? "",
    allowLateJoin: settings.allowLateJoin,
    exactPoints: String(settings.scoring.exactPoints),
    correctOutcomePoints: String(settings.scoring.correctOutcomePoints),
    incorrectPoints: String(settings.scoring.incorrectPoints),
  }));
  const [prizeRows, setPrizeRows] = useState<PrizeRow[]>(() =>
    settings.prizes.map((prize, index) => ({
      key: index + 1,
      percentage: percentageBpsToInputValue(prize.percentageBps),
    })),
  );
  const [nextPrizeKey, setNextPrizeKey] = useState(
    settings.prizes.length + 1,
  );
  const readOnly =
    settings.status === "completed" || settings.status === "archived";
  const rulesLocked = areLeagueRulesEffectivelyLocked(settings);
  const currentSettingsVersion =
    state.settingsVersion ?? settings.settingsVersion;
  const currentScoringVersion =
    state.scoringVersion ?? settings.scoring.version;

  function addPrizeRow() {
    setPrizeRows((rows) => [
      ...rows,
      { key: nextPrizeKey, percentage: "" },
    ]);
    setNextPrizeKey((value) => value + 1);
  }

  function removePrizeRow(key: number) {
    setPrizeRows((rows) => rows.filter((row) => row.key !== key));
  }

  function updatePrizePercentage(key: number, percentage: string) {
    setPrizeRows((rows) =>
      rows.map((row) => (row.key === key ? { ...row, percentage } : row)),
    );
  }

  return (
    <form action={formAction} className="space-y-8" noValidate>
      <input type="hidden" name="leagueId" value={settings.id} />
      <input
        type="hidden"
        name="expectedSettingsVersion"
        value={currentSettingsVersion}
      />

      {state.message ? (
        <FormMessage kind={state.status === "success" ? "success" : "error"}>
          {state.message}
        </FormMessage>
      ) : null}

      {settings.editorRole === "system-admin" ? (
        <FormMessage kind="info">
          העמוד נפתח בהרשאת מנהל מערכת עבור הליגה המבוקשת בלבד.
        </FormMessage>
      ) : null}

      {readOnly ? (
        <FormMessage kind="info">
          ליגה שהושלמה או הועברה לארכיון היא לקריאה בלבד.
        </FormMessage>
      ) : null}

      <div className="grid min-w-0 gap-5 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2">
          <label
            htmlFor="settings-league-name"
            className="block text-sm font-semibold text-ink"
          >
            שם הליגה
          </label>
          <input
            id="settings-league-name"
            name="name"
            type="text"
            required
            minLength={3}
            maxLength={80}
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
            readOnly={readOnly}
            aria-invalid={Boolean(state.fieldErrors?.name)}
            aria-describedby={
              state.fieldErrors?.name
                ? "settings-league-name-error settings-league-name-help"
                : "settings-league-name-help"
            }
            className="mt-2 w-full min-w-0 rounded-lg border border-control-border px-3 py-2.5 outline-none transition read-only:bg-surface-subtle read-only:text-ink-secondary focus:border-focus focus:ring-2 focus:ring-navy-200"
          />
          <p id="settings-league-name-help" className="mt-1 text-sm text-ink-muted">
            בין 3 ל־80 תווים.
          </p>
          <FieldError
            id="settings-league-name-error"
            messages={state.fieldErrors?.name}
          />
        </div>

        <div className="min-w-0 sm:col-span-2">
          <label
            htmlFor="settings-league-description"
            className="block text-sm font-semibold text-ink"
          >
            תיאור <span className="font-normal text-ink-muted">(אופציונלי)</span>
          </label>
          <textarea
            id="settings-league-description"
            name="description"
            rows={4}
            maxLength={500}
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            readOnly={readOnly}
            aria-invalid={Boolean(state.fieldErrors?.description)}
            aria-describedby={
              state.fieldErrors?.description
                ? "settings-league-description-error"
                : undefined
            }
            className="mt-2 w-full min-w-0 resize-y rounded-lg border border-control-border px-3 py-2.5 outline-none transition read-only:bg-surface-subtle read-only:text-ink-secondary focus:border-focus focus:ring-2 focus:ring-navy-200"
          />
          <FieldError
            id="settings-league-description-error"
            messages={state.fieldErrors?.description}
          />
        </div>

        <div className="min-w-0">
          <label
            htmlFor="settings-demo-entry-fee"
            className="block text-sm font-semibold text-ink"
          >
            סכום השתתפות Demo באגורות
          </label>
          <input
            id="settings-demo-entry-fee"
            name="demoEntryFeeAgorot"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            required
            value={draft.demoEntryFeeAgorot}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                demoEntryFeeAgorot: event.target.value,
              }))
            }
            readOnly={readOnly}
            aria-invalid={Boolean(state.fieldErrors?.demoEntryFeeAgorot)}
            aria-describedby={
              state.fieldErrors?.demoEntryFeeAgorot
                ? "settings-demo-entry-fee-error settings-demo-entry-fee-help"
                : "settings-demo-entry-fee-help"
            }
            className="mt-2 w-full min-w-0 rounded-lg border border-control-border px-3 py-2.5 outline-none transition read-only:bg-surface-subtle read-only:text-ink-secondary focus:border-focus focus:ring-2 focus:ring-navy-200"
          />
          <p id="settings-demo-entry-fee-help" className="mt-1 text-sm text-ink-muted">
            לדוגמה: 2500 מייצג ₪25.00 לצורכי הדגמה בלבד.
          </p>
          <FieldError
            id="settings-demo-entry-fee-error"
            messages={state.fieldErrors?.demoEntryFeeAgorot}
          />
        </div>

        <div className="min-w-0">
          <label
            htmlFor="settings-joins-close-at"
            className="block text-sm font-semibold text-ink"
          >
            סגירת בקשות הצטרפות (UTC)
          </label>
          <input
            id="settings-joins-close-at"
            name="joinsCloseAt"
            type="text"
            value={draft.joinsCloseAt}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                joinsCloseAt: event.target.value,
              }))
            }
            readOnly={readOnly}
            dir="ltr"
            autoComplete="off"
            placeholder="2098-12-31T23:59:59.123456"
            aria-invalid={Boolean(state.fieldErrors?.joinsCloseAt)}
            aria-describedby={
              state.fieldErrors?.joinsCloseAt
                ? "settings-joins-close-at-error settings-joins-close-at-help"
                : "settings-joins-close-at-help"
            }
            className="mt-2 w-full min-w-0 rounded-lg border border-control-border px-3 py-2.5 text-left outline-none transition read-only:bg-surface-subtle read-only:text-ink-secondary focus:border-focus focus:ring-2 focus:ring-navy-200"
          />
          <p id="settings-joins-close-at-help" className="mt-1 text-sm text-ink-muted">
            פורמט UTC: YYYY-MM-DDTHH:mm:ss, עם עד שש ספרות שבר אופציונליות.
            ריק משאיר את ההצטרפות ללא מועד סגירה.
          </p>
          <FieldError
            id="settings-joins-close-at-error"
            messages={state.fieldErrors?.joinsCloseAt}
          />
        </div>

        <div className="min-w-0 sm:col-span-2">
          <label
            htmlFor="settings-demo-payment-instructions"
            className="block text-sm font-semibold text-ink"
          >
            הוראות Demo <span className="font-normal text-ink-muted">(אופציונלי)</span>
          </label>
          <textarea
            id="settings-demo-payment-instructions"
            name="demoPaymentInstructions"
            rows={3}
            maxLength={500}
            value={draft.demoPaymentInstructions}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                demoPaymentInstructions: event.target.value,
              }))
            }
            readOnly={readOnly}
            aria-invalid={Boolean(
              state.fieldErrors?.demoPaymentInstructions,
            )}
            aria-describedby={
              state.fieldErrors?.demoPaymentInstructions
                ? "settings-demo-payment-instructions-error settings-demo-payment-instructions-help"
                : "settings-demo-payment-instructions-help"
            }
            className="mt-2 w-full min-w-0 resize-y rounded-lg border border-control-border px-3 py-2.5 outline-none transition read-only:bg-surface-subtle read-only:text-ink-secondary focus:border-focus focus:ring-2 focus:ring-navy-200"
          />
          <p
            id="settings-demo-payment-instructions-help"
            className="mt-1 text-sm text-ink-muted"
          >
            טקסט בלבד, ללא קישור תשלום וללא העברת כסף אמיתי.
          </p>
          <FieldError
            id="settings-demo-payment-instructions-error"
            messages={state.fieldErrors?.demoPaymentInstructions}
          />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-line p-4">
        <input
          name="allowLateJoin"
          type="checkbox"
          checked={draft.allowLateJoin}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              allowLateJoin: event.target.checked,
            }))
          }
          disabled={readOnly}
          className="mt-1 size-4 accent-action"
        />
        <span>
          <span className="block font-semibold text-ink">לאפשר הצטרפות מאוחרת</span>
          <span className="mt-1 block text-sm leading-6 text-ink-secondary">
            חברים שיצטרפו מאוחר לא יקבלו נקודות רטרואקטיביות.
          </span>
        </span>
      </label>

      <fieldset
        aria-describedby="settings-scoring-help"
        className="rounded-xl border border-line p-4 sm:p-5"
      >
        <legend className="px-2 text-lg font-bold text-ink">חוקי ניקוד</legend>
        <p id="settings-scoring-help" className="mb-4 text-sm leading-6 text-ink-secondary">
          הערכים חייבים להיות בסדר יורד: תוצאה מדויקת, כיוון נכון, כיוון שגוי.
          גרסה נוכחית: {currentScoringVersion}.
        </p>
        {rulesLocked ? (
          <p
            role="status"
            className="mb-4 rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900"
          >
            חוקי הניקוד ופרסי ה־Demo נעולים לצמיתות לאחר תחילת משחק, latch של
            ניחושים, או מעבר הליגה למצב פעיל.
          </p>
        ) : settings.firstKickoffAt ? (
          <p className="mb-4 text-sm text-ink-muted">
            נעילה לפי זמן מסד הנתונים לפני המשחק הראשון: {formatUtcDateTime(settings.firstKickoffAt)} UTC.
          </p>
        ) : null}

        <div className="grid min-w-0 gap-4 sm:grid-cols-3">
          {[
            {
              id: "settings-exact-points",
              name: "exactPoints" as const,
              label: "תוצאה מדויקת",
              value: draft.exactPoints,
              errorKey: "scoring.exactPoints",
            },
            {
              id: "settings-correct-outcome-points",
              name: "correctOutcomePoints" as const,
              label: "כיוון נכון",
              value: draft.correctOutcomePoints,
              errorKey: "scoring.correctOutcomePoints",
            },
            {
              id: "settings-incorrect-points",
              name: "incorrectPoints" as const,
              label: "כיוון שגוי",
              value: draft.incorrectPoints,
              errorKey: "scoring.incorrectPoints",
            },
          ].map(({ id, name, label, value, errorKey }) => (
            <div key={name} className="min-w-0">
              <label htmlFor={id} className="block text-sm font-semibold text-ink">
                {label}
              </label>
              <input
                id={id}
                name={name}
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                required
                value={value}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [name]: event.target.value,
                  }))
                }
                readOnly={rulesLocked || readOnly}
                aria-invalid={Boolean(state.fieldErrors?.[errorKey])}
                aria-describedby={
                  state.fieldErrors?.[errorKey] ? `${id}-error` : undefined
                }
                className="mt-2 w-full min-w-0 rounded-lg border border-control-border px-3 py-2.5 outline-none transition read-only:bg-surface-subtle read-only:text-ink-secondary focus:border-focus focus:ring-2 focus:ring-navy-200"
              />
              <FieldError
                id={`${id}-error`}
                messages={state.fieldErrors?.[errorKey]}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset
        aria-describedby="settings-prizes-help"
        className="rounded-xl border border-line p-4 sm:p-5"
      >
        <legend className="px-2 text-lg font-bold text-ink">חלוקת פרסי Demo</legend>
        <p id="settings-prizes-help" className="mb-4 text-sm leading-6 text-ink-secondary">
          המיקומים נגזרים מסדר השורות. סכום האחוזים חייב להיות 100% בדיוק.
        </p>

        <div className="space-y-4">
          {prizeRows.map((row, index) => {
            const positionError =
              state.fieldErrors?.[`prizes.${index}.position`];
            const percentageError =
              state.fieldErrors?.[`prizes.${index}.percentageBps`];

            return (
              <div
                key={row.key}
                className="grid min-w-0 gap-3 rounded-lg bg-surface-subtle p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              >
                <div className="min-w-0">
                  <label
                    htmlFor={`settings-prize-position-${row.key}`}
                    className="block text-sm font-semibold text-ink"
                  >
                    מיקום
                  </label>
                  <input
                    id={`settings-prize-position-${row.key}`}
                    name="prizePosition"
                    type="number"
                    inputMode="numeric"
                    value={index + 1}
                    readOnly
                    aria-invalid={Boolean(positionError)}
                    aria-describedby={
                      positionError
                        ? `settings-prize-position-${row.key}-error`
                        : undefined
                    }
                    className="mt-2 w-full min-w-0 rounded-lg border border-control-border bg-white px-3 py-2.5 text-locked-900 outline-none"
                  />
                  <FieldError
                    id={`settings-prize-position-${row.key}-error`}
                    messages={positionError}
                  />
                </div>

                <div className="min-w-0">
                  <label
                    htmlFor={`settings-prize-percentage-${row.key}`}
                    className="block text-sm font-semibold text-ink"
                  >
                    אחוז
                  </label>
                  <input
                    id={`settings-prize-percentage-${row.key}`}
                    name="prizePercentage"
                    type="text"
                    inputMode="decimal"
                    required
                    value={row.percentage}
                    onChange={(event) =>
                      updatePrizePercentage(row.key, event.target.value)
                    }
                    readOnly={rulesLocked || readOnly}
                    placeholder="0.00"
                    aria-invalid={Boolean(percentageError)}
                    aria-describedby={
                      percentageError
                        ? `settings-prize-percentage-${row.key}-error`
                        : undefined
                    }
                    className="mt-2 w-full min-w-0 rounded-lg border border-control-border bg-white px-3 py-2.5 outline-none transition read-only:bg-surface-subtle read-only:text-ink-secondary focus:border-focus focus:ring-2 focus:ring-navy-200"
                  />
                  <FieldError
                    id={`settings-prize-percentage-${row.key}-error`}
                    messages={percentageError}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => removePrizeRow(row.key)}
                  disabled={
                    rulesLocked || readOnly || prizeRows.length === 1
                  }
                  aria-label={`הסרת מיקום פרס ${index + 1}`}
                  className="min-h-11 rounded-lg border border-line px-3 py-2.5 text-sm font-semibold text-navy-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40"
                >
                  הסרה
                </button>
              </div>
            );
          })}
        </div>

        <FieldError
          id="settings-prizes-error"
          alert
          messages={state.fieldErrors?.prizes ?? state.fieldErrors?.form}
        />

        <button
          type="button"
          onClick={addPrizeRow}
          disabled={rulesLocked || readOnly || prizeRows.length >= 100}
          className="mt-4 min-h-11 rounded-lg border border-navy-200 px-4 py-2 text-sm font-semibold text-navy-700 hover:bg-navy-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
        >
          הוספת מיקום פרס
        </button>
      </fieldset>

      <div
        className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm leading-6 text-warning-900"
        role="note"
      >
        <strong>מצב Demo בלבד:</strong> הסכומים וחלוקת הפרסים הם סימולציה.
        האפליקציה אינה גובה, מחזיקה או מעבירה כסף.
      </div>

      <p className="text-sm text-ink-muted">
        גרסת הגדרות נוכחית: {currentSettingsVersion}. החלטות נעילה מתקבלות לפי
        זמן מסד הנתונים, שנדגם בטעינה ב־{formatUtcDateTime(settings.databaseTime)} UTC.
      </p>

      <button
        type="submit"
        disabled={pending || readOnly}
        className="min-h-11 w-full rounded-lg bg-action px-5 py-3 font-semibold text-white transition hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {pending ? "שומרים את ההגדרות..." : "שמירת הגדרות"}
      </button>
    </form>
  );
}
