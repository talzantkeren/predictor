import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/features/auth/session";
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
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          לא ניתן לטעון את הדירוג כרגע. יש לרענן ולנסות שוב.
        </p>
      </main>
    );
  }

  const { league, standings } = result.data;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">{league.name}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">טבלת דירוג</h1>
          <p className="mt-2 max-w-2xl leading-7 text-slate-600">
            הדירוג נקבע לפי נקודות ואז לפי מספר כיוונים נכונים. תוצאות מדויקות
            מוצגות כמידע בלבד ואינן שובר שוויון נוסף.
          </p>
        </div>
        <Link
          href={`/leagues/${league.id}`}
          className="self-start rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          חזרה לליגה
        </Link>
      </div>

      {standings.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          עדיין אין חברים פעילים להצגה בדירוג.
        </p>
      ) : (
        <section className="mt-6" aria-labelledby="standings-title">
          <h2 id="standings-title" className="sr-only">דירוג חברי הליגה</h2>

          <ol className="space-y-3 md:hidden">
            {standings.map((standing) => (
              <li
                key={standing.userId}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-blue-700">מקום {standing.rank}</p>
                    <p className="mt-1 break-words text-lg font-bold">{standing.displayName}</p>
                  </div>
                  <p className="text-2xl font-bold">{standing.totalPoints}</p>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <dt className="text-slate-600">כיוונים</dt>
                    <dd className="mt-1 font-bold">{standing.correctOutcomes}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <dt className="text-slate-600">מדויקות</dt>
                    <dd className="mt-1 font-bold">{standing.exactScores}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <dt className="text-slate-600">ניחושים</dt>
                    <dd className="mt-1 font-bold">{standing.predictionsSubmitted}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>

          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="min-w-full border-collapse text-right">
              <caption className="sr-only">דירוג חברי הליגה לפי ניקוד וכיוונים נכונים</caption>
              <thead className="bg-slate-50 text-sm text-slate-700">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">מקום</th>
                  <th scope="col" className="px-5 py-3 font-semibold">משתתף/ת</th>
                  <th scope="col" className="px-5 py-3 font-semibold">נקודות</th>
                  <th scope="col" className="px-5 py-3 font-semibold">כיוונים נכונים</th>
                  <th scope="col" className="px-5 py-3 font-semibold">תוצאות מדויקות</th>
                  <th scope="col" className="px-5 py-3 font-semibold">ניחושים</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {standings.map((standing) => (
                  <tr key={standing.userId}>
                    <td className="px-5 py-4 text-lg font-bold text-blue-700">{standing.rank}</td>
                    <th scope="row" className="px-5 py-4 font-semibold">{standing.displayName}</th>
                    <td className="px-5 py-4 text-lg font-bold">{standing.totalPoints}</td>
                    <td className="px-5 py-4">{standing.correctOutcomes}</td>
                    <td className="px-5 py-4">{standing.exactScores}</td>
                    <td className="px-5 py-4">{standing.predictionsSubmitted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
