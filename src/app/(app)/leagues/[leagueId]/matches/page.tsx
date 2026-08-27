import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { KeysetPagination } from "@/components/ui/keyset-pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAuthenticatedUser } from "@/features/auth/session";
import { LeagueTabs } from "@/features/leagues/components/league-tabs";
import { getLeagueStatusLabel } from "@/features/leagues/display";
import { RoundCard } from "@/features/predictions/components/round-card";
import { getLeagueMatchList } from "@/features/predictions/queries";
import { groupMatchesByRound } from "@/features/predictions/round-groups";
import { parseMatchListFilter } from "@/features/predictions/schemas";
import { parseOptionalKeysetCursor } from "@/lib/keyset-pagination";

export const dynamic = "force-dynamic";

export default async function LeagueMatchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{
    round?: string | string[];
    date?: string | string[];
    cursor?: string | string[];
  }>;
}) {
  const { leagueId } = await params;
  if (!z.string().uuid().safeParse(leagueId).success) notFound();

  const query = await searchParams;
  const filter = parseMatchListFilter(query);
  const cursor = parseOptionalKeysetCursor(query.cursor);
  const { supabase, user } = await requireAuthenticatedUser(
    `/leagues/${leagueId}/matches`,
  );

  if (!filter.success || !cursor.success) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <ErrorState>מסנן המשחקים או קישור העמוד אינו תקין.</ErrorState>
        <Link
          href={`/leagues/${leagueId}/matches`}
          className="mt-4 inline-flex min-h-11 items-center rounded-lg px-3 font-bold text-navy-700 underline-offset-4 hover:underline"
        >
          הצגת כל המשחקים
        </Link>
      </main>
    );
  }

  const result = await getLeagueMatchList(
    supabase,
    leagueId,
    user.id,
    filter.data,
    cursor.data,
  );

  if (result.status === "not-found") notFound();
  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <ErrorState>
          לא ניתן לטעון את משחקי הליגה כרגע. יש לרענן ולנסות שוב.
        </ErrorState>
      </main>
    );
  }

  const data = result.data;
  const roundGroups = groupMatchesByRound(data.matches.items);
  const monogram = data.league.name.trim().slice(0, 2) || "P1";
  const filterParams = new URLSearchParams();
  if (filter.data?.kind === "round") {
    filterParams.set("round", String(filter.data.round));
  } else if (filter.data?.kind === "date") {
    filterParams.set("date", filter.data.date);
  }
  const firstPageQuery = filterParams.toString();
  const firstPageHref = firstPageQuery
    ? `/leagues/${leagueId}/matches?${firstPageQuery}`
    : `/leagues/${leagueId}/matches`;
  const nextParams = new URLSearchParams(filterParams);
  if (data.matches.nextCursor) {
    nextParams.set("cursor", data.matches.nextCursor);
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
                {data.league.competitionName} · <bdi>{data.league.seasonName}</bdi>
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-ink sm:text-4xl">
                משחקים וניחושים
              </h1>
              <p className="mt-2 break-words text-ink-secondary">
                {data.league.name}
              </p>
            </div>
          </div>
          <StatusBadge tone={data.league.status === "open" ? "success" : "info"}>
            {getLeagueStatusLabel(data.league.status)}
          </StatusBadge>
        </div>
      </header>

      <div className="mt-5 overflow-hidden rounded-2xl border border-line shadow-card">
        <LeagueTabs
          leagueId={leagueId}
          active="matches"
          isManager={data.viewerIsManager}
        />
      </div>

      <section
        aria-label="סינון משחקים"
        className="mt-6 grid min-w-0 gap-3 rounded-2xl border border-line bg-white p-4 shadow-card sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"
      >
        <form method="get" className="flex min-w-0 items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="round-filter" className="block text-sm font-bold text-ink">
              מחזור
            </label>
            <input
              id="round-filter"
              name="round"
              type="number"
              min="1"
              max="100"
              inputMode="numeric"
              defaultValue={
                filter.data?.kind === "round" ? String(filter.data.round) : ""
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-control-border bg-white px-3 py-2.5 text-ink outline-none focus:border-focus"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-action px-4 py-2 font-extrabold text-white hover:bg-action-hover"
          >
            סינון
          </button>
        </form>

        <form method="get" className="flex min-w-0 items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="date-filter" className="block text-sm font-bold text-ink">
              תאריך משחק
            </label>
            <input
              id="date-filter"
              name="date"
              type="date"
              defaultValue={filter.data?.kind === "date" ? filter.data.date : ""}
              className="mt-1 min-h-11 w-full rounded-lg border border-control-border bg-white px-3 py-2.5 text-ink outline-none focus:border-focus"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-action px-4 py-2 font-extrabold text-white hover:bg-action-hover"
          >
            סינון
          </button>
        </form>

        <Link
          href={`/leagues/${leagueId}/matches`}
          className="inline-flex min-h-11 items-center justify-center self-end rounded-lg border border-line px-4 py-2 text-center font-bold text-navy-700 hover:bg-navy-100"
        >
          ניקוי מסנן
        </Link>
      </section>

      {!data.viewerIsActiveMember ? (
        <p
          role="status"
          className="mt-5 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm leading-6 text-warning-900"
        >
          אפשר לצפות בלוח כמנהל/ת הליגה, אך שמירה וקריאת ניחושים דורשות חברות
          פעילה.
        </p>
      ) : null}

      {roundGroups.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={
              cursor.data
                ? "אין משחקים נוספים בעמוד זה"
                : filter.data
                  ? "אין משחקים שמתאימים למסנן"
                  : "עדיין אין משחקים בליגה"
            }
          >
            {cursor.data
              ? "אפשר לחזור לעמוד הראשון בלי לשנות את המסנן."
              : filter.data
                ? "אפשר לשנות או לנקות את מסנן המחזור או התאריך."
                : "משחקים יופיעו כאן לאחר טעינת קטלוג העונה."}
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6 grid gap-6">
          {roundGroups.map((group) => (
            <RoundCard
              key={group.roundNumber}
              leagueId={leagueId}
              leagueStatus={data.league.status}
              group={group}
              databaseNow={data.databaseNow}
              viewerIsActiveMember={data.viewerIsActiveMember}
              progressScope="visible"
            />
          ))}
        </div>
      )}
      <KeysetPagination
        ariaLabel="דפדוף במשחקי הליגה"
        firstHref={firstPageHref}
        nextHref={
          data.matches.nextCursor
            ? `/leagues/${leagueId}/matches?${nextParams.toString()}`
            : null
        }
        hasCurrentCursor={cursor.data !== undefined}
      />
    </main>
  );
}
