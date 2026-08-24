import { notFound } from "next/navigation";
import { z } from "zod";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAuthenticatedUser } from "@/features/auth/session";
import { LeagueTabs } from "@/features/leagues/components/league-tabs";
import { getLeagueStandings } from "@/features/scoring/queries";

export const dynamic = "force-dynamic";

export default async function LeagueStandingsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  if (!z.string().uuid().safeParse(leagueId).success) notFound();

  const { supabase, user } = await requireAuthenticatedUser(
    `/leagues/${leagueId}/standings`,
  );
  const result = await getLeagueStandings(supabase, leagueId, user.id);

  if (result.status === "not-found") notFound();
  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <ErrorState>
          לא ניתן לטעון את הדירוג כרגע. יש לרענן ולנסות שוב.
        </ErrorState>
      </main>
    );
  }

  const { league, standings, viewerIsManager } = result.data;
  const monogram = league.name.trim().slice(0, 2) || "P1";
  const ranks = new Map<number, number>();
  for (const standing of standings) {
    ranks.set(standing.rank, (ranks.get(standing.rank) ?? 0) + 1);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-7">
        <div className="flex min-w-0 items-start gap-4">
          <span
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-2xl bg-navy-100 text-xl font-black text-navy-900"
          >
            {monogram}
          </span>
          <div className="min-w-0">
            <p className="break-words text-sm font-bold text-ink-muted">
              {league.name}
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-ink sm:text-4xl">
              טבלת דירוג
            </h1>
            <p className="mt-2 max-w-3xl leading-7 text-ink-secondary">
              הדירוג נקבע לפי נקודות ואז לפי מספר כיוונים נכונים. תוצאות
              מדויקות מוצגות כמידע בלבד; בשוויון מלא המשתתפים חולקים מקום.
            </p>
          </div>
        </div>
      </header>

      <div className="mt-5 overflow-hidden rounded-2xl border border-line shadow-card">
        <LeagueTabs
          leagueId={league.id}
          active="standings"
          isManager={viewerIsManager}
        />
      </div>

      {standings.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="הדירוג עדיין ריק">
            עדיין אין חברים פעילים להצגה בדירוג.
          </EmptyState>
        </div>
      ) : (
        <section className="mt-6" aria-labelledby="standings-title">
          <h2 id="standings-title" className="sr-only">
            דירוג חברי הליגה
          </h2>

          <ol className="space-y-3 md:hidden">
            {standings.map((standing) => {
              const isViewer = standing.userId === user.id;
              const isTied = (ranks.get(standing.rank) ?? 0) > 1;

              return (
                <li
                  key={standing.userId}
                  className={`rounded-2xl border p-5 shadow-card ${
                    isViewer
                      ? "border-success-200 bg-success-50"
                      : "border-line bg-white"
                  }`}
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
                        {isViewer ? (
                          <StatusBadge tone="success">את/ה</StatusBadge>
                        ) : null}
                      </div>
                      <p className="mt-1 break-words text-lg font-black text-ink">
                        {standing.displayName}
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
                    <div className="rounded-lg bg-white/70 p-2">
                      <dt className="text-ink-muted">כיוונים</dt>
                      <dd className="tabular-nums mt-1 font-black text-ink">
                        {standing.correctOutcomes}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-white/70 p-2">
                      <dt className="text-ink-muted">מדויקות</dt>
                      <dd className="tabular-nums mt-1 font-black text-ink">
                        {standing.exactScores}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-white/70 p-2">
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

          <div className="hidden overflow-x-auto rounded-2xl border border-line bg-white shadow-card md:block">
            <table className="min-w-full border-collapse text-start">
              <caption className="sr-only">
                דירוג חברי הליגה לפי ניקוד וכיוונים נכונים
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
                    ניחושים
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {standings.map((standing) => {
                  const isViewer = standing.userId === user.id;
                  const isTied = (ranks.get(standing.rank) ?? 0) > 1;

                  return (
                    <tr
                      key={standing.userId}
                      className={isViewer ? "bg-success-50" : undefined}
                    >
                      <td
                        className={`tabular-nums border-s-4 px-5 py-4 text-lg font-black text-navy-900 ${
                          isViewer ? "border-action" : "border-transparent"
                        }`}
                      >
                        {standing.rank}
                      </td>
                      <th
                        scope="row"
                        className="max-w-sm px-5 py-4 font-extrabold text-ink"
                      >
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="min-w-0 break-words">
                            {standing.displayName}
                          </span>
                          {isTied ? (
                            <StatusBadge tone="neutral" symbol="=">
                              שוויון
                            </StatusBadge>
                          ) : null}
                          {isViewer ? (
                            <StatusBadge tone="success">את/ה</StatusBadge>
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
        </section>
      )}
    </main>
  );
}
