import Link from "next/link";

import { requireAuthenticatedUser } from "@/features/auth/session";
import {
  getLeagueRoleLabel,
  getLeagueStatusLabel,
} from "@/features/leagues/display";
import { getDashboardLeagues } from "@/features/leagues/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, user } = await requireAuthenticatedUser("/dashboard");
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const leagues = await getDashboardLeagues(supabase, user.id);

  const displayName = profile?.display_name ?? "משתמש";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="space-y-6">
        <section
          aria-labelledby="dashboard-title"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <p className="text-sm font-semibold text-blue-700">לוח אישי</p>
          <h1 id="dashboard-title" className="mt-2 text-3xl font-bold tracking-tight">
            שלום {displayName}
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-600">
            כאן אפשר לנהל את הליגות הפרטיות שלך ולעדכן את פרטי הפרופיל.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/leagues/new"
              className="inline-flex rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              יצירת ליגה
            </Link>
            <Link
              href="/profile"
              className="inline-flex rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              מעבר לפרופיל
            </Link>
          </div>
        </section>

        <section aria-labelledby="my-leagues-title" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">המרחב שלי</p>
              <h2 id="my-leagues-title" className="mt-1 text-2xl font-bold">הליגות שלי</h2>
            </div>
            <Link href="/leagues/new" className="font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
              יצירת ליגה חדשה
            </Link>
          </div>

          {!leagues.ok ? (
            <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              לא ניתן לטעון את רשימת הליגות כרגע. יש לרענן ולנסות שוב.
            </p>
          ) : leagues.data.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <h3 className="font-bold text-slate-900">עדיין אין לך ליגות</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                אפשר ליצור ליגה פרטית ראשונה עם חוקי ניקוד ופרסי Demo מותאמים.
              </p>
              <Link href="/leagues/new" className="mt-4 inline-flex rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
                יצירת הליגה הראשונה
              </Link>
            </div>
          ) : (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {leagues.data.map((league) => (
                <li key={league.id}>
                  <Link href={`/leagues/${league.id}`} className="block h-full rounded-xl border border-slate-200 p-5 transition hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
                    <h3 className="break-words text-lg font-bold text-slate-950">{league.name}</h3>
                    <dl className="mt-3 space-y-2 text-sm text-slate-600">
                      <div className="flex justify-between gap-4"><dt>עונה</dt><dd className="font-semibold text-slate-900">{league.seasonName}</dd></div>
                      <div className="flex justify-between gap-4"><dt>סטטוס</dt><dd className="font-semibold text-slate-900">{getLeagueStatusLabel(league.status)}</dd></div>
                      <div className="flex justify-between gap-4"><dt>התפקיד שלי</dt><dd className="text-left font-semibold text-slate-900">{getLeagueRoleLabel(league.role)}</dd></div>
                    </dl>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
