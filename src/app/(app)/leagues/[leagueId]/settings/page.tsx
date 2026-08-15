import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/features/auth/session";
import { InviteControls } from "@/features/membership/components/invite-controls";
import { getLeagueInviteSettings } from "@/features/membership/queries";
import { getPublicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function LeagueSettingsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  if (!z.string().uuid().safeParse(leagueId).success) {
    notFound();
  }

  const { supabase, user } = await requireAuthenticatedUser(
    `/leagues/${leagueId}/settings`,
  );
  const result = await getLeagueInviteSettings(supabase, leagueId, user.id);

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          לא ניתן לטעון את הגדרות ההזמנה כרגע. יש לרענן ולנסות שוב.
        </p>
      </main>
    );
  }

  const leagueClosed =
    result.league.status === "completed" || result.league.status === "archived";
  const applicationOrigin = new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).origin;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <section
        aria-labelledby="league-settings-title"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
      >
        <p className="text-sm font-semibold text-blue-700">ניהול ליגה פרטית</p>
        <h1 id="league-settings-title" className="mt-2 break-words text-3xl font-bold tracking-tight">
          הגדרות הזמנה — {result.league.name}
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">
          הקישור הגולמי מוצג פעם אחת בלבד. החלפת קישור מבטלת מיד את הקישור הקודם.
        </p>

        <aside
          aria-label="הודעת מצב Demo"
          className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950"
        >
          זהו דמו בלבד — אין להעביר כסף ואין להעלות מסמך פיננסי אמיתי.
        </aside>

        <div className="mt-7">
          {leagueClosed ? (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
              ליגה שהסתיימה או הועברה לארכיון אינה יכולה לקבל הזמנות חדשות.
            </p>
          ) : (
            <InviteControls
              leagueId={result.league.id}
              invite={result.invite}
              applicationOrigin={applicationOrigin}
            />
          )}
        </div>

        <div className="mt-8 border-t border-slate-200 pt-5">
          <Link
            href={`/leagues/${result.league.id}`}
            className="font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            חזרה לסיכום הליגה
          </Link>
        </div>
      </section>
    </main>
  );
}
