import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { DemoNotice } from "@/components/ui/demo-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { IsolatedText } from "@/components/ui/isolated-text";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAuthenticatedUser } from "@/features/auth/session";
import { LeagueTabs } from "@/features/leagues/components/league-tabs";
import { getLeagueStatusLabel } from "@/features/leagues/display";
import { getJoinRequestStatusCountLabel } from "@/features/membership/display";
import { getManagerLeagueReport } from "@/features/reports/service";

export const dynamic = "force-dynamic";

const summaryItems = [
  {
    key: "activeMembers" as const,
    label: "חברים פעילים",
    description: "חברויות פעילות כעת",
    tone: "bg-success-50 text-success-900",
  },
  {
    key: "pendingApproval" as const,
    label: getJoinRequestStatusCountLabel("pending_approval"),
    description: "בקשות שממתינות לפעולת המנהל/ת",
    tone: "bg-warning-50 text-warning-900",
  },
  {
    key: "pendingProof" as const,
    label: getJoinRequestStatusCountLabel("pending_proof"),
    description: "בקשות שממתינות להשלמה מצד המצטרפים",
    tone: "bg-navy-100 text-navy-900",
  },
  {
    key: "rejected" as const,
    label: getJoinRequestStatusCountLabel("rejected"),
    description: "בקשות היסטוריות שנדחו",
    tone: "bg-surface-subtle text-ink-secondary",
  },
];

export default async function ManagerReportsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  if (!z.string().uuid().safeParse(leagueId).success) notFound();

  const { supabase, user } = await requireAuthenticatedUser(
    `/leagues/${leagueId}/reports`,
  );
  const result = await getManagerLeagueReport(supabase, leagueId, user.id);

  if (result.status === "not-found") notFound();
  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <ErrorState>
          לא ניתן לטעון את הדוח כרגע. יש לרענן ולנסות שוב.
        </ErrorState>
      </main>
    );
  }

  const { league, membership, standings, standingsKind } = result.data;
  const monogram = league.name.trim().slice(0, 2) || "P1";
  const standingsTitle =
    standingsKind === "final" ? "דירוג סופי" : "דירוג נוכחי";
  const ranks = new Map<number, number>();
  for (const standing of standings) {
    ranks.set(standing.rank, (ranks.get(standing.rank) ?? 0) + 1);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-7">
        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden="true"
              className="grid size-14 shrink-0 place-items-center rounded-2xl bg-navy-100 text-xl font-black text-navy-900"
            >
              {monogram}
            </span>
            <div className="min-w-0">
              <p className="break-words text-sm font-bold text-ink-muted">
                <IsolatedText>{league.name}</IsolatedText>
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-ink sm:text-4xl">
                דוח מנהל
              </h1>
              <p className="mt-2 max-w-3xl leading-7 text-ink-secondary">
                תמונת מצב מרוכזת של החברות בליגה ושל הדירוג לפי כללי התחרות.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:max-w-64 sm:justify-end">
            <StatusBadge
              tone={league.status === "active" ? "success" : "info"}
            >
              {getLeagueStatusLabel(league.status)}
            </StatusBadge>
            <Link
              href={`/leagues/${league.id}`}
              className="inline-flex min-h-11 items-center rounded-lg border border-control-border bg-white px-4 py-2 text-sm font-extrabold text-navy-700 hover:bg-navy-100"
            >
              חזרה לליגה
            </Link>
          </div>
        </div>
      </header>

      <div className="mt-5 overflow-hidden rounded-2xl border border-line shadow-card">
        <LeagueTabs leagueId={league.id} active="reports" isManager />
      </div>

      <DemoNotice className="mt-6" title="דוח מידע בלבד">
        דוח זה עוסק בחברות ובדירוג בלבד ואינו מציג או מנהל תשלומים, דמי
        השתתפות או פרסים כספיים. Predictor1 אינה גובה, מחזיקה או מעבירה כסף.
      </DemoNotice>

      <section className="mt-6" aria-labelledby="membership-summary-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-ink-muted">סטטוס חברות</p>
            <h2
              id="membership-summary-title"
              className="mt-1 text-2xl font-black text-ink"
            >
              תמונת מצב
            </h2>
          </div>
          <p className="text-sm text-ink-muted">כל בקשה נספרת פעם אחת</p>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaryItems.map((item) => (
            <div
              key={item.key}
              className="min-w-0 rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5"
            >
              <dt className="break-words text-sm font-extrabold text-ink-secondary">
                {item.label}
              </dt>
              <dd
                className={`tabular-nums mt-3 inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl px-3 text-3xl font-black ${item.tone}`}
              >
                {membership[item.key]}
              </dd>
              <dd className="mt-3 break-words text-xs leading-5 text-ink-muted">
                {item.description}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8" aria-labelledby="report-standings-title">
        <div>
          <p className="text-sm font-bold text-ink-muted">
            {standingsKind === "final"
              ? "הליגה הושלמה"
              : "הליגה טרם הושלמה"}
          </p>
          <h2
            id="report-standings-title"
            className="mt-1 text-2xl font-black text-ink"
          >
            {standingsTitle}
          </h2>
          <p className="mt-2 max-w-3xl leading-7 text-ink-secondary">
            נקודות קודמות לכיוונים נכונים. תוצאות מדויקות הן מידע בלבד,
            ובשוויון מלא מוצג מקום משותף בשיטת 1, 1, 3.
          </p>
        </div>

        {standings.length === 0 ? (
          <div className="mt-5">
            <EmptyState title="אין עדיין נתוני דירוג">
              אין חברים פעילים להצגה בדוח זה.
            </EmptyState>
          </div>
        ) : (
          <>
            <ol className="mt-5 space-y-3 md:hidden">
              {standings.map((standing) => {
                const isTied = (ranks.get(standing.rank) ?? 0) > 1;
                return (
                  <li
                    key={standing.userId}
                    className="rounded-2xl border border-line bg-white p-5 shadow-card"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-navy-700">
                            מקום {standing.rank}
                          </p>
                          {isTied ? (
                            <StatusBadge tone="neutral" symbol="=">
                              שוויון
                            </StatusBadge>
                          ) : null}
                        </div>
                        <p className="mt-1 break-words text-lg font-black text-ink">
                          <IsolatedText>{standing.displayName}</IsolatedText>
                        </p>
                      </div>
                      <p className="tabular-nums shrink-0 text-3xl font-black text-ink">
                        <span aria-hidden="true">{standing.totalPoints}</span>
                        <span className="sr-only">
                          {standing.totalPoints} נקודות
                        </span>
                      </p>
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                      <div className="rounded-lg bg-surface-subtle p-2">
                        <dt className="text-ink-muted">כיוונים</dt>
                        <dd className="tabular-nums mt-1 font-black text-ink">
                          {standing.correctOutcomes}
                        </dd>
                      </div>
                      <div className="rounded-lg bg-surface-subtle p-2">
                        <dt className="text-ink-muted">מדויקות</dt>
                        <dd className="tabular-nums mt-1 font-black text-ink">
                          {standing.exactScores}
                        </dd>
                      </div>
                      <div className="rounded-lg bg-surface-subtle p-2">
                        <dt className="text-ink-muted">ניחושים</dt>
                        <dd className="tabular-nums mt-1 font-black text-ink">
                          {standing.predictionsSubmitted}
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ol>

            <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-line bg-white shadow-card md:block">
              <table className="min-w-full border-collapse text-start">
                <caption className="sr-only">
                  {standingsTitle} של חברי הליגה לפי נקודות וכיוונים נכונים
                </caption>
                <thead className="bg-surface-subtle text-sm text-ink-secondary">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-extrabold">
                      מקום
                    </th>
                    <th scope="col" className="px-5 py-3 font-extrabold">
                      משתתף/ת
                    </th>
                    <th
                      scope="col"
                      aria-sort="descending"
                      className="px-5 py-3 font-extrabold"
                    >
                      נקודות <span aria-hidden="true">▼</span>
                    </th>
                    <th scope="col" className="px-5 py-3 font-extrabold">
                      כיוונים נכונים
                    </th>
                    <th scope="col" className="px-5 py-3 font-extrabold">
                      תוצאות מדויקות
                    </th>
                    <th scope="col" className="px-5 py-3 font-extrabold">
                      ניחושים שהוגשו
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {standings.map((standing) => {
                    const isTied = (ranks.get(standing.rank) ?? 0) > 1;
                    return (
                      <tr key={standing.userId}>
                        <td className="tabular-nums px-5 py-4 text-lg font-black text-navy-900">
                          {standing.rank}
                        </td>
                        <th
                          scope="row"
                          className="max-w-sm px-5 py-4 font-extrabold text-ink"
                        >
                          <span className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="min-w-0 break-words">
                              <IsolatedText>{standing.displayName}</IsolatedText>
                            </span>
                            {isTied ? (
                              <StatusBadge tone="neutral" symbol="=">
                                שוויון
                              </StatusBadge>
                            ) : null}
                          </span>
                        </th>
                        <td className="tabular-nums px-5 py-4 text-lg font-black text-ink">
                          {standing.totalPoints}
                        </td>
                        <td className="tabular-nums px-5 py-4 font-bold text-ink">
                          {standing.correctOutcomes}
                        </td>
                        <td className="tabular-nums px-5 py-4 text-ink-secondary">
                          {standing.exactScores}
                        </td>
                        <td className="tabular-nums px-5 py-4 text-ink-secondary">
                          {standing.predictionsSubmitted}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
