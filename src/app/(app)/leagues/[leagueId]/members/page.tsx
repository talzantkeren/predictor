import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/features/auth/session";
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
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          לא ניתן לטעון את בקשות ההצטרפות כרגע. יש לרענן ולנסות שוב.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">ניהול ליגה</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">בקשות הצטרפות</h1>
          <p className="mt-2 text-slate-600">{result.league.name}</p>
        </div>
        <Link
          href={`/leagues/${leagueId}`}
          className="self-start rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          חזרה לליגה
        </Link>
      </div>

      <aside className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        תמונות Demo הן דוגמאות בלבד ואינן הוכחת תשלום. הצפייה בהן זמנית ומותרת רק למנהל/ת הליגה ולמעלה התמונה.
      </aside>

      {result.requests.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          עדיין אין בקשות הצטרפות לליגה הזו.
        </p>
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
