import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/features/auth/session";
import {
  formatDemoAmount,
  formatPrizePercentage,
  getLeagueRoleLabel,
  getLeagueStatusLabel,
} from "@/features/leagues/display";
import { getLeagueSummary } from "@/features/leagues/queries";

export const dynamic = "force-dynamic";

export default async function LeagueSummaryPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  if (!z.string().uuid().safeParse(leagueId).success) {
    notFound();
  }

  const { supabase, user } = await requireAuthenticatedUser(`/leagues/${leagueId}`);
  const result = await getLeagueSummary(supabase, leagueId, user.id);

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          לא ניתן לטעון את פרטי הליגה כרגע. יש לרענן את העמוד ולנסות שוב.
        </p>
      </main>
    );
  }

  const league = result.data;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="league-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-blue-700">{league.competitionName} · {league.seasonName}</p>
              <h1 id="league-title" className="mt-2 break-words text-3xl font-bold tracking-tight">
                {league.name}
              </h1>
              {league.description ? (
                <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600">{league.description}</p>
              ) : (
                <p className="mt-3 text-slate-500">לא נוסף תיאור לליגה.</p>
              )}
            </div>
            <div className="shrink-0 space-y-3">
              <dl className="rounded-xl bg-slate-50 p-4 text-sm">
                <div>
                  <dt className="font-semibold text-slate-600">סטטוס</dt>
                  <dd className="mt-1 text-slate-950">{getLeagueStatusLabel(league.status)}</dd>
                </div>
                <div className="mt-3">
                  <dt className="font-semibold text-slate-600">התפקיד שלי</dt>
                  <dd className="mt-1 text-slate-950">{getLeagueRoleLabel(league.role)}</dd>
                </div>
              </dl>
              {league.role === "manager" ? (
                <Link
                  href={`/leagues/${league.id}/settings`}
                  className="flex justify-center rounded-lg border border-blue-300 px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                >
                  ניהול קישור ההזמנה
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <aside className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950" aria-label="הודעת מצב Demo">
          <h2 className="font-bold">Demo בלבד — ללא כסף אמיתי</h2>
          <p className="mt-2 text-sm leading-6">
            הסכום, ההוראות והפרסים במסך זה הם סימולציה. Predictor1 אינה גובה, מחזיקה, מעבירה או מאמתת כסף.
          </p>
        </aside>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="demo-settings-title">
            <h2 id="demo-settings-title" className="text-xl font-bold">הגדרות Demo והצטרפות</h2>
            <dl className="mt-4 space-y-4">
              <div>
                <dt className="text-sm font-semibold text-slate-600">סכום הדגמה</dt>
                <dd className="mt-1 text-lg font-bold">{formatDemoAmount(league.demoEntryFeeAgorot)}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-slate-600">הוראות Demo</dt>
                <dd className="mt-1 whitespace-pre-wrap leading-7 text-slate-800">
                  {league.demoPaymentInstructions ?? "לא הוגדרו הוראות."}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-slate-600">הצטרפות מאוחרת</dt>
                <dd className="mt-1">{league.allowLateJoin ? "מותרת, ללא ניקוד רטרואקטיבי" : "אינה מותרת"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="scoring-title">
            <h2 id="scoring-title" className="text-xl font-bold">חוקי ניקוד</h2>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-emerald-50 p-3">
                <dt className="text-sm text-emerald-900">מדויק</dt>
                <dd className="mt-1 text-2xl font-bold text-emerald-950">{league.scoring.exactPoints}</dd>
              </div>
              <div className="rounded-xl bg-blue-50 p-3">
                <dt className="text-sm text-blue-900">כיוון</dt>
                <dd className="mt-1 text-2xl font-bold text-blue-950">{league.scoring.correctOutcomePoints}</dd>
              </div>
              <div className="rounded-xl bg-slate-100 p-3">
                <dt className="text-sm text-slate-700">שגוי</dt>
                <dd className="mt-1 text-2xl font-bold text-slate-950">{league.scoring.incorrectPoints}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-slate-500">
              גרסת חוקים {league.scoring.version}{league.scoring.lockedAt ? " · נעולה" : " · טרם ננעלה"}
            </p>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="prizes-title">
          <h2 id="prizes-title" className="text-xl font-bold">חלוקת פרסי Demo</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {league.prizes.map((prize) => (
              <li key={prize.position} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-4">
                <span className="font-semibold">מקום {prize.position}</span>
                <span className="text-lg font-bold text-blue-800">{formatPrizePercentage(prize.percentageBps)}%</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
