import { notFound } from "next/navigation";
import { z } from "zod";

import { DemoNotice } from "@/components/ui/demo-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { KeysetPagination } from "@/components/ui/keyset-pagination";
import { requireAuthenticatedUser } from "@/features/auth/session";
import { LeagueTabs } from "@/features/leagues/components/league-tabs";
import { ManagerJoinRequestCard } from "@/features/membership/components/manager-join-request-card";
import {
  getActiveLeagueMembersPage,
  getManagerJoinRequests,
} from "@/features/membership/queries";
import { parseJoinRequestStatusFilter } from "@/features/membership/schemas";
import { parseOptionalKeysetCursor } from "@/lib/keyset-pagination";

export const dynamic = "force-dynamic";

const approvedAtFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function getMembersHref(
  leagueId: string,
  values: Record<string, string | undefined>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return `/leagues/${leagueId}/members${query ? `?${query}` : ""}`;
}

export default async function LeagueMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{
    cursor?: string | string[];
    membersCursor?: string | string[];
    status?: string | string[];
  }>;
}) {
  const { leagueId } = await params;
  if (!z.string().uuid().safeParse(leagueId).success) notFound();

  const query = await searchParams;
  const requestCursor = parseOptionalKeysetCursor(query.cursor);
  const memberCursor = parseOptionalKeysetCursor(query.membersCursor);
  const status = parseJoinRequestStatusFilter(query.status);
  const { supabase, user } = await requireAuthenticatedUser(
    `/leagues/${leagueId}/members`,
  );

  if (!requestCursor.success || !memberCursor.success || !status.success) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <ErrorState>מסנן הבקשות או קישור העמוד אינו תקין.</ErrorState>
      </main>
    );
  }

  const directory = await getActiveLeagueMembersPage(
    supabase,
    leagueId,
    user.id,
    memberCursor.data,
  );
  if (directory.status === "not-found") notFound();
  if (directory.status === "error") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <ErrorState>
          לא ניתן לטעון את רשימת חברי הליגה כרגע. יש לרענן ולנסות שוב.
        </ErrorState>
      </main>
    );
  }

  const managerQueue = directory.viewerIsManager
    ? await getManagerJoinRequests(
        supabase,
        leagueId,
        user.id,
        requestCursor.data,
        status.data,
      )
    : null;
  if (managerQueue?.status === "not-found") notFound();
  if (managerQueue?.status === "error") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <ErrorState>
          לא ניתן לטעון את בקשות ההצטרפות כרגע. יש לרענן ולנסות שוב.
        </ErrorState>
      </main>
    );
  }

  const monogram = directory.league.name.trim().slice(0, 2) || "P1";
  const requestPage =
    managerQueue?.status === "found" ? managerQueue.requests : null;

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
              {directory.league.name}
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-ink sm:text-4xl">
              חברי הליגה
            </h1>
            <p className="mt-2 max-w-3xl leading-7 text-ink-secondary">
              רשימה לקריאה בלבד של החברים הפעילים בליגה.
            </p>
          </div>
        </div>
      </header>

      <div className="mt-5 overflow-hidden rounded-2xl border border-line shadow-card">
        <LeagueTabs
          leagueId={leagueId}
          active="members"
          isManager={directory.viewerIsManager}
        />
      </div>

      <section className="mt-6" aria-labelledby="active-members-title">
        <div className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6">
          <h2 id="active-members-title" className="text-xl font-black text-ink">
            חברים פעילים
          </h2>
          <p className="mt-1 text-sm leading-6 text-ink-secondary">
            מוצגים שם התצוגה ומועד ההצטרפות בלבד.
          </p>

          {directory.members.items.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title={
                  memberCursor.data
                    ? "אין חברים נוספים בעמוד זה"
                    : "עדיין אין חברים פעילים"
                }
              >
                {memberCursor.data
                  ? "אפשר לחזור לעמוד הראשון של רשימת החברים."
                  : "חברים שאושרו להצטרף יופיעו כאן."}
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {directory.members.items.map((member) => (
                <li
                  key={member.membershipId}
                  className="min-w-0 rounded-xl border border-line bg-surface-subtle p-4"
                >
                  <p className="break-words font-extrabold text-ink">
                    <bdi dir="auto">{member.displayName}</bdi>
                  </p>
                  <p className="mt-1 text-sm text-ink-secondary">
                    הצטרפות: {approvedAtFormatter.format(new Date(member.approvedAt))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <KeysetPagination
          ariaLabel="דפדוף בחברי הליגה"
          firstHref={getMembersHref(leagueId, {
            status: status.data,
            cursor:
              typeof query.cursor === "string" ? query.cursor : undefined,
          })}
          nextHref={
            directory.members.nextCursor
              ? getMembersHref(leagueId, {
                  status: status.data,
                  cursor:
                    typeof query.cursor === "string" ? query.cursor : undefined,
                  membersCursor: directory.members.nextCursor,
                })
              : null
          }
          hasCurrentCursor={memberCursor.data !== undefined}
        />
      </section>

      {requestPage ? (
        <section className="mt-8" aria-labelledby="join-requests-title">
          <h2 id="join-requests-title" className="text-2xl font-black text-ink">
            בקשות הצטרפות
          </h2>
          <p className="mt-2 leading-7 text-ink-secondary">
            בדיקת בקשות, היסטוריית תמונות Demo וקבלת החלטה מתועדת.
          </p>

          <DemoNotice className="mt-5" title="תמונות Demo בלבד">
            התמונות הן דוגמאות ואינן הוכחת תשלום. הצפייה בהן זמנית ומותרת רק
            למנהל/ת הליגה ולמעלה התמונה.
          </DemoNotice>

          <form
            method="get"
            className="mt-6 flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-card sm:flex-row sm:items-end"
          >
            {typeof query.membersCursor === "string" ? (
              <input
                type="hidden"
                name="membersCursor"
                value={query.membersCursor}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <label
                htmlFor="request-status-filter"
                className="block text-sm font-bold text-ink"
              >
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

          {requestPage.items.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title={
                  requestCursor.data
                    ? "אין בקשות נוספות בעמוד זה"
                    : status.data
                      ? "אין בקשות במצב שנבחר"
                      : "עדיין אין בקשות הצטרפות"
                }
              >
                {requestCursor.data
                  ? "אפשר לחזור לעמוד הראשון בלי לשנות את המסנן."
                  : status.data
                    ? "אפשר לבחור מצב אחר או לנקות את המסנן."
                    : "בקשות חדשות שיוגשו דרך קישור ההזמנה יוצגו כאן לבדיקה."}
              </EmptyState>
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {requestPage.items.map((request) => (
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
            firstHref={getMembersHref(leagueId, {
              status: status.data,
              membersCursor:
                typeof query.membersCursor === "string"
                  ? query.membersCursor
                  : undefined,
            })}
            nextHref={
              requestPage.nextCursor
                ? getMembersHref(leagueId, {
                    status: status.data,
                    cursor: requestPage.nextCursor,
                    membersCursor:
                      typeof query.membersCursor === "string"
                        ? query.membersCursor
                        : undefined,
                  })
                : null
            }
            hasCurrentCursor={requestCursor.data !== undefined}
          />
        </section>
      ) : null}
    </main>
  );
}
