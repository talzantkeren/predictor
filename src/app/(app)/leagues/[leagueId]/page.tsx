import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { DemoNotice } from "@/components/ui/demo-notice";
import { ErrorState } from "@/components/ui/error-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAuthenticatedUser } from "@/features/auth/session";
import { LeagueTabs } from "@/features/leagues/components/league-tabs";
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

  if (result.status === "not-found") notFound();

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <ErrorState>
          לא ניתן לטעון את פרטי הליגה כרגע. יש לרענן את העמוד ולנסות שוב.
        </ErrorState>
      </main>
    );
  }

  const league = result.data;
  const isManager = league.role === "manager";
  const monogram = league.name.trim().slice(0, 2) || "P1";

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
                {league.competitionName} · <bdi>{league.seasonName}</bdi>
              </p>
              <h1 className="mt-1 break-words text-3xl font-black tracking-tight text-ink sm:text-4xl">
                {league.name}
              </h1>
              {league.description ? (
                <p className="mt-3 max-w-3xl whitespace-pre-wrap break-words leading-7 text-ink-secondary">
                  {league.description}
                </p>
              ) : (
                <p className="mt-3 text-ink-muted">לא נוסף תיאור לליגה.</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-64 sm:justify-end">
            <StatusBadge tone={league.status === "open" ? "success" : "info"}>
              {getLeagueStatusLabel(league.status)}
            </StatusBadge>
            <StatusBadge tone="neutral" symbol="◆">
              {getLeagueRoleLabel(league.role)}
            </StatusBadge>
          </div>
        </div>
      </header>

      <div className="mt-5 overflow-hidden rounded-2xl border border-line shadow-card">
        <LeagueTabs
          leagueId={league.id}
          active="overview"
          isManager={isManager}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <section
            className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6"
            aria-labelledby="scoring-title"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-ink-muted">
                  גרסה {league.scoring.version} · {league.scoring.lockedAt ? "נעולה" : "טרם ננעלה"}
                </p>
                <h2 id="scoring-title" className="mt-1 text-2xl font-black text-ink">
                  חוקי ניקוד
                </h2>
              </div>
              <Link
                href={`/leagues/${league.id}/matches`}
                className="inline-flex min-h-11 items-center rounded-lg bg-action px-4 py-2 font-extrabold text-white hover:bg-action-hover"
              >
                משחקים וניחושים
              </Link>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-success-50 p-3">
                <dt className="text-sm font-bold text-success-900">תוצאה מדויקת</dt>
                <dd className="tabular-nums mt-1 text-3xl font-black text-success-900">
                  {league.scoring.exactPoints}
                </dd>
              </div>
              <div className="rounded-xl bg-navy-100 p-3">
                <dt className="text-sm font-bold text-navy-700">כיוון נכון</dt>
                <dd className="tabular-nums mt-1 text-3xl font-black text-navy-900">
                  {league.scoring.correctOutcomePoints}
                </dd>
              </div>
              <div className="rounded-xl bg-locked-50 p-3">
                <dt className="text-sm font-bold text-locked-900">כיוון שגוי</dt>
                <dd className="tabular-nums mt-1 text-3xl font-black text-locked-900">
                  {league.scoring.incorrectPoints}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm leading-6 text-ink-muted">
              שובר שוויון משתמש במספר הכיוונים הנכונים. תוצאות מדויקות מוצגות
              כמידע בלבד.
            </p>
          </section>

          <section
            className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6"
            aria-labelledby="prizes-title"
          >
            <h2 id="prizes-title" className="text-2xl font-black text-ink">
              חלוקת פרסי Demo
            </h2>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {league.prizes.map((prize) => (
                <li
                  key={prize.position}
                  className="flex min-w-0 items-center justify-between gap-4 rounded-xl bg-surface-subtle p-4"
                >
                  <span className="font-bold">מקום {prize.position}</span>
                  <span className="tabular-nums text-xl font-black text-navy-700">
                    {formatPrizePercentage(prize.percentageBps)}%
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="min-w-0 space-y-5">
          <DemoNotice>
            הסכום, ההוראות והפרסים הם סימולציה. Predictor1 אינה גובה, מחזיקה,
            מעבירה או מאמתת כסף.
          </DemoNotice>

          <section
            className="rounded-2xl border border-line bg-white p-5 shadow-card"
            aria-labelledby="demo-settings-title"
          >
            <h2 id="demo-settings-title" className="text-xl font-black text-ink">
              הגדרות Demo והצטרפות
            </h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div className="min-w-0">
                <dt className="font-bold text-ink-muted">סכום הדגמה</dt>
                <dd className="tabular-nums mt-1 break-words text-lg font-black text-ink">
                  {formatDemoAmount(league.demoEntryFeeAgorot)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-bold text-ink-muted">הוראות Demo</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words leading-6 text-ink-secondary">
                  {league.demoPaymentInstructions ?? "לא הוגדרו הוראות."}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-ink-muted">הצטרפות מאוחרת</dt>
                <dd className="mt-1 break-words leading-6 text-ink">
                  {league.allowLateJoin
                    ? "מותרת, ללא ניקוד רטרואקטיבי"
                    : "אינה מותרת"}
                </dd>
              </div>
            </dl>
          </section>

          {isManager ? (
            <section
              className="rounded-2xl border border-line bg-white p-5 shadow-card"
              aria-labelledby="management-title"
            >
              <h2 id="management-title" className="text-xl font-black text-ink">
                כלים לניהול הליגה
              </h2>
              <div className="mt-4 grid gap-3">
                <Link
                  href={`/leagues/${league.id}/members`}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-navy-700 px-4 py-2 font-bold text-white hover:bg-navy-900"
                >
                  ניהול בקשות הצטרפות
                </Link>
                <Link
                  href={`/leagues/${league.id}/settings`}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 py-2 font-bold text-navy-700 hover:bg-navy-100"
                >
                  ניהול קישור ההזמנה
                </Link>
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
