import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";

import { requireAuthenticatedUser } from "@/features/auth/session";
import { LocalDateTime } from "@/features/predictions/components/local-date-time";
import {
  DEFAULT_MATCH_TIME_ZONE,
  formatDateTimeInTimeZone,
} from "@/features/predictions/display";
import {
  getSyncFailureMessage,
  getSyncSkipReasonLabel,
  getSyncStatusLabel,
} from "@/features/sync/display";
import { SyncTriggerForm } from "@/features/sync/components/sync-trigger-form";
import { getSystemSyncRuns } from "@/features/sync/queries";
import type { SyncStatus } from "@/features/sync/types";

export const dynamic = "force-dynamic";

const statusClasses: Record<SyncStatus, string> = {
  running: "border-blue-200 bg-blue-50 text-blue-900",
  succeeded: "border-emerald-200 bg-emerald-50 text-emerald-900",
  failed: "border-red-200 bg-red-50 text-red-900",
  skipped: "border-slate-300 bg-slate-100 text-slate-800",
};

function utcTimestamp(instant: string) {
  return new Date(instant).toISOString();
}

export default async function SystemSyncPage() {
  const { supabase } = await requireAuthenticatedUser("/admin/sync");
  const result = await getSystemSyncRuns(supabase);

  if (result.status === "denied") notFound();

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"
        >
          לא ניתן לטעון את יומן הסנכרון כרגע. יש לרענן ולנסות שוב.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">מנהל מערכת</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            סטטוס סנכרון
          </h1>
          <p className="mt-2 max-w-2xl leading-7 text-slate-600">
            יומן הריצות המורשות האחרונות עבור המסלול הידני או API‑Football.
            נתוני הספק נשמרים רק דרך תהליך שרת מגודר ואטומי.
          </p>
        </div>
        <nav aria-label="ניווט ניהול" className="flex flex-wrap gap-2">
          <Link
            href="/admin/matches"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            ניהול משחקים ותוצאות
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            חזרה לליגות
          </Link>
        </nav>
      </div>

      <SyncTriggerForm />

      {result.runs.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          עדיין לא תועדו ניסיונות סנכרון מורשים.
        </p>
      ) : (
        <ol className="mt-6 space-y-4">
          {result.runs.map((run) => {
            const failureMessage = getSyncFailureMessage(run);

            return (
              <li key={run.id}>
                <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold">ניסיון סנכרון</h2>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[run.status]}`}
                        >
                          {getSyncStatusLabel(run.status)}
                        </span>
                      </div>
                      <p className="mt-2 break-all font-mono text-xs text-slate-500" dir="ltr">
                        {run.id}
                      </p>
                    </div>
                    <p className="text-sm text-slate-600">
                      ספק: {run.provider === "manual" ? "ידני" : run.provider}
                    </p>
                  </div>

                  <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="font-semibold text-slate-600">משחקים שנצפו</dt>
                      <dd className="mt-1 text-lg font-bold">{run.fixturesSeen}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-600">משחקים שהשתנו</dt>
                      <dd className="mt-1 text-lg font-bold">{run.matchesChanged}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-600">תוצאות שהשתנו</dt>
                      <dd className="mt-1 text-lg font-bold">{run.resultsChanged}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-600">שורות שנוספו</dt>
                      <dd className="mt-1 text-lg font-bold">{run.rowsInserted}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-600">קבוצות שהשתנו</dt>
                      <dd className="mt-1 text-lg font-bold">{run.teamsChanged}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-600">עקיפות ידניות שנשמרו</dt>
                      <dd className="mt-1 text-lg font-bold">{run.manualOverridesSkipped}</dd>
                    </div>
                  </dl>

                  <dl className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <div>
                      <dt className="inline font-semibold">סוג עבודה: </dt>
                      <dd className="inline">{run.syncKind}</dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold">מכסה יומית שנותרה: </dt>
                      <dd className="inline">{run.quotaRemaining ?? "לא דווח"}</dd>
                    </div>
                  </dl>

                  {run.operatorNotes.length > 0 ? (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                      <p className="font-semibold">הערות מפעיל</p>
                      <ul className="mt-1 list-inside list-disc" dir="ltr">
                        {run.operatorNotes.map((note) => (
                          <li key={note} className="break-all font-mono text-xs">{note}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {run.status === "skipped" ? (
                    <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <span className="font-semibold">סיבת דילוג: </span>
                      {getSyncSkipReasonLabel(run.resultCode)}
                    </p>
                  ) : null}

                  {failureMessage ? (
                    <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                      <span className="font-semibold">פרטי כשל: </span>
                      {failureMessage}
                    </p>
                  ) : null}

                  <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-slate-600">התחלה — זמן מקומי</dt>
                      <dd className="mt-1">
                        <LocalDateTime
                          instant={run.startedAt}
                          initialText={formatDateTimeInTimeZone(
                            run.startedAt,
                            DEFAULT_MATCH_TIME_ZONE,
                          )}
                          initialTimeZone={DEFAULT_MATCH_TIME_ZONE}
                        />
                      </dd>
                      <dd className="mt-1 break-all font-mono text-xs text-slate-500" dir="ltr">
                        UTC {utcTimestamp(run.startedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-600">סיום — זמן מקומי</dt>
                      {run.finishedAt ? (
                        <>
                          <dd className="mt-1">
                            <LocalDateTime
                              instant={run.finishedAt}
                              initialText={formatDateTimeInTimeZone(
                                run.finishedAt,
                                DEFAULT_MATCH_TIME_ZONE,
                              )}
                              initialTimeZone={DEFAULT_MATCH_TIME_ZONE}
                            />
                          </dd>
                          <dd className="mt-1 break-all font-mono text-xs text-slate-500" dir="ltr">
                            UTC {utcTimestamp(run.finishedAt)}
                          </dd>
                        </>
                      ) : (
                        <dd className="mt-1 text-slate-500">טרם הסתיים</dd>
                      )}
                    </div>
                  </dl>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
