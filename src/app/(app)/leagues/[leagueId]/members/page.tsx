import { notFound } from "next/navigation";
import { z } from "zod";

import { DemoNotice } from "@/components/ui/demo-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { requireAuthenticatedUser } from "@/features/auth/session";
import { LeagueTabs } from "@/features/leagues/components/league-tabs";
import { ManagerJoinRequestCard } from "@/features/membership/components/manager-join-request-card";
import { getManagerJoinRequests } from "@/features/membership/queries";

export const dynamic = "force-dynamic";

export default async function ManagerJoinRequestsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  if (!z.string().uuid().safeParse(leagueId).success) notFound();

  const { supabase, user } = await requireAuthenticatedUser(
    `/leagues/${leagueId}/members`,
  );
  const result = await getManagerJoinRequests(supabase, leagueId, user.id);
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

      {result.requests.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="עדיין אין בקשות הצטרפות">
            בקשות חדשות שיוגשו דרך קישור ההזמנה יוצגו כאן לבדיקה.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {result.requests.map((request) => (
            <ManagerJoinRequestCard
              key={request.requestId}
              leagueId={leagueId}
              request={request}
            />
          ))}
        </div>
      )}
    </main>
  );
}
