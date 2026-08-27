import { notFound } from "next/navigation";
import { z } from "zod";

import { DemoNotice } from "@/components/ui/demo-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { KeysetPagination } from "@/components/ui/keyset-pagination";
import { requireAuthenticatedUser } from "@/features/auth/session";
import { LeagueTabs } from "@/features/leagues/components/league-tabs";
import { ManagerJoinRequestCard } from "@/features/membership/components/manager-join-request-card";
import { getManagerJoinRequests } from "@/features/membership/queries";
import { parseJoinRequestStatusFilter } from "@/features/membership/schemas";
import { parseOptionalKeysetCursor } from "@/lib/keyset-pagination";

export const dynamic = "force-dynamic";

export default async function ManagerJoinRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{
    cursor?: string | string[];
    status?: string | string[];
  }>;
}) {
  const { leagueId } = await params;
  if (!z.string().uuid().safeParse(leagueId).success) notFound();

  const query = await searchParams;
  const cursor = parseOptionalKeysetCursor(query.cursor);
  const status = parseJoinRequestStatusFilter(query.status);

  const { supabase, user } = await requireAuthenticatedUser(
    `/leagues/${leagueId}/members`,
  );

  if (!cursor.success || !status.success) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <ErrorState>מסנן הבקשות או קישור העמוד אינו תקין.</ErrorState>
      </main>
    );
  }

  const result = await getManagerJoinRequests(
    supabase,
    leagueId,
    user.id,
    cursor.data,
    status.data,
  );
  if (result.status === "not-found") notFound();

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <ErrorState>
          לא ניתן לטעון את בקשות ההצטרפות כרגע. יש לרענן ולנסות שוב.
        </ErrorState>
      </main>
    );
  }

  const monogram = result.league.name.trim().slice(0, 2) || "P1";

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
              {result.league.name}
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-ink sm:text-4xl">
              בקשות הצטרפות
            </h1>
            <p className="mt-2 max-w-3xl leading-7 text-ink-secondary">
              בדיקת בקשות, היסטוריית תמונות Demo וקבלת החלטה מתועדת.
            </p>
          </div>
        </div>
      </header>

      <div className="mt-5 overflow-hidden rounded-2xl border border-line shadow-card">
        <LeagueTabs leagueId={leagueId} active="members" isManager />
      </div>

      <DemoNotice className="mt-6" title="תמונות Demo בלבד">
        התמונות הן דוגמאות ואינן הוכחת תשלום. הצפייה בהן זמנית ומותרת רק
        למנהל/ת הליגה ולמעלה התמונה.
      </DemoNotice>

      <form
        method="get"
        className="mt-6 flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-card sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="request-status-filter" className="block text-sm font-bold text-ink">
            מצב בקשה
          </label>
          <select
            id="request-status-filter"
            name="status"
            defaultValue={status.data ?? ""}
            className="mt-1 min-h-11 w-full rounded-lg border border-control-border bg-white px-3 py-2.5 text-ink outline-none focus:border-focus"
          >
            <option value="">כל המצבים</option>
            <option value="pending_approval">ממתינה להחלטה</option>
            <option value="pending_proof">ממתינה לתמונת Demo</option>
            <option value="approved">אושרה</option>
            <option value="rejected">נדחתה</option>
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-action px-5 py-2.5 font-extrabold text-white hover:bg-action-hover"
        >
          סינון
        </button>
      </form>

      {result.requests.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={
              cursor.data
                ? "אין בקשות נוספות בעמוד זה"
                : status.data
                  ? "אין בקשות במצב שנבחר"
                  : "עדיין אין בקשות הצטרפות"
            }
          >
            {cursor.data
              ? "אפשר לחזור לעמוד הראשון בלי לשנות את המסנן."
              : status.data
                ? "אפשר לבחור מצב אחר או לנקות את המסנן."
                : "בקשות חדשות שיוגשו דרך קישור ההזמנה יוצגו כאן לבדיקה."}
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {result.requests.items.map((request) => (
            <ManagerJoinRequestCard
              key={request.requestId}
              leagueId={leagueId}
              request={request}
            />
          ))}
        </div>
      )}
      <KeysetPagination
        ariaLabel="דפדוף בבקשות ההצטרפות"
        firstHref={
          status.data
            ? `/leagues/${leagueId}/members?status=${status.data}`
            : `/leagues/${leagueId}/members`
        }
        nextHref={
          result.requests.nextCursor
            ? `/leagues/${leagueId}/members?${new URLSearchParams({
                ...(status.data ? { status: status.data } : {}),
                cursor: result.requests.nextCursor,
              }).toString()}`
            : null
        }
        hasCurrentCursor={cursor.data !== undefined}
      />
    </main>
  );
}
