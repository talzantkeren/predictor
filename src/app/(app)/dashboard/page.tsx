import Link from "next/link";

import { DemoNotice } from "@/components/ui/demo-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { KeysetPagination } from "@/components/ui/keyset-pagination";
import { requireAuthenticatedUser } from "@/features/auth/session";
import { LeagueCard } from "@/features/leagues/components/league-card";
import { getDashboardLeagues } from "@/features/leagues/queries";
import { JoinRequestCard } from "@/features/membership/components/join-request-card";
import { getMyJoinRequests } from "@/features/membership/queries";
import { parseOptionalKeysetCursor } from "@/lib/keyset-pagination";

export const dynamic = "force-dynamic";

function getDashboardHref({
  leagueCursor,
  requestCursor,
}: {
  leagueCursor?: string | null;
  requestCursor?: string | null;
}) {
  const params = new URLSearchParams();
  if (leagueCursor) params.set("leagueCursor", leagueCursor);
  if (requestCursor) params.set("requestCursor", requestCursor);
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    leagueCursor?: string | string[];
    requestCursor?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const leagueCursor = parseOptionalKeysetCursor(query.leagueCursor);
  const requestCursor = parseOptionalKeysetCursor(query.requestCursor);
  const { supabase, user } = await requireAuthenticatedUser("/dashboard");

  if (!leagueCursor.success || !requestCursor.success) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <ErrorState>קישור העמוד אינו תקין.</ErrorState>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg px-3 font-bold text-navy-700 underline-offset-4 hover:underline"
        >
          חזרה לעמוד הראשון
        </Link>
      </main>
    );
  }

  const [profileResult, leagues, joinRequests] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
    getDashboardLeagues(supabase, leagueCursor.data),
    getMyJoinRequests(supabase, requestCursor.data),
  ]);

  const displayName = profileResult.data?.display_name ?? "משתמש";

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-action">לוח אישי</p>
          <h1 className="mt-1 break-words text-4xl font-black tracking-tight text-ink sm:text-5xl">
            שלום {displayName}
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-7 text-ink-secondary">
            הליגות, בקשות ההצטרפות והפעולות שכבר פתוחות עבורך במקום אחד.
          </p>
        </div>
        <Link
          href="/leagues/new"
          className="inline-flex min-h-11 items-center justify-center self-start rounded-lg bg-action px-5 py-2.5 font-extrabold text-white transition hover:bg-action-hover sm:self-auto"
        >
          יצירת ליגה
        </Link>
      </header>

      <section aria-labelledby="my-leagues-title" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-ink-muted">המרחב שלי</p>
            <h2 id="my-leagues-title" className="mt-1 text-3xl font-black text-ink">
              הליגות שלי
            </h2>
          </div>
          <Link
            href="/leagues/new"
            className="inline-flex min-h-11 items-center rounded-lg px-3 font-bold text-navy-700 hover:bg-navy-100"
          >
            יצירת ליגה חדשה
          </Link>
        </div>

        {!leagues.ok ? (
          <div className="mt-5">
            <ErrorState>
              לא ניתן לטעון את רשימת הליגות כרגע. יש לרענן ולנסות שוב.
            </ErrorState>
          </div>
        ) : leagues.data.items.length === 0 && leagueCursor.data ? (
          <p className="mt-5 rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm leading-6 text-ink-secondary">
            אין ליגות נוספות בעמוד זה. אפשר לחזור לעמוד הראשון.
          </p>
        ) : leagues.data.items.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title="עדיין אין לך ליגות"
              action={
                <Link
                  href="/leagues/new"
                  className="inline-flex min-h-11 items-center rounded-lg bg-action px-5 py-2.5 font-extrabold text-white hover:bg-action-hover"
                >
                  יצירת הליגה הראשונה
                </Link>
              }
            >
              אפשר ליצור ליגה פרטית ראשונה עם חוקי ניקוד ופרסי Demo מותאמים.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-5 grid gap-5 md:grid-cols-2">
            {leagues.data.items.map((league) => (
              <li key={league.id} className="min-w-0">
                <LeagueCard league={league} />
              </li>
            ))}
          </ul>
        )}
        {leagues.ok ? (
          <KeysetPagination
            ariaLabel="דפדוף בליגות שלי"
            firstHref={getDashboardHref({
              requestCursor: query.requestCursor as string | undefined,
            })}
            nextHref={
              leagues.data.nextCursor
                ? getDashboardHref({
                    leagueCursor: leagues.data.nextCursor,
                    requestCursor: query.requestCursor as string | undefined,
                  })
                : null
            }
            hasCurrentCursor={leagueCursor.data !== undefined}
          />
        ) : null}
      </section>

      <section aria-labelledby="my-join-requests-title" className="mt-12">
        <div>
          <p className="text-sm font-bold text-ink-muted">הצטרפות לליגות</p>
          <h2
            id="my-join-requests-title"
            className="mt-1 text-3xl font-black text-ink"
          >
            בקשות ההצטרפות שלי
          </h2>
        </div>

        <DemoNotice
          className="mt-5"
          title="Demo בלבד — אין להעביר כסף או מסמך פיננסי אמיתי"
        >
          האסמכתאות הן תמונות סינתטיות לצורך הדגמת הזרימה בלבד ואינן מוכיחות
          תשלום או העברה.
        </DemoNotice>

        {!joinRequests.ok ? (
          <div className="mt-5">
            <ErrorState>
              לא ניתן לטעון את בקשות ההצטרפות כרגע. יש לרענן ולנסות שוב.
            </ErrorState>
          </div>
        ) : joinRequests.data.items.length === 0 && requestCursor.data ? (
          <p className="mt-5 rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm leading-6 text-ink-secondary">
            אין בקשות נוספות בעמוד זה. אפשר לחזור לעמוד הראשון.
          </p>
        ) : joinRequests.data.items.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm leading-6 text-ink-secondary">
            עדיין לא פתחת בקשת הצטרפות לליגה אחרת.
          </p>
        ) : (
          <div className="mt-5 grid gap-5">
            {joinRequests.data.items.map((request) => (
              <JoinRequestCard key={request.requestId} request={request} />
            ))}
          </div>
        )}
        {joinRequests.ok ? (
          <KeysetPagination
            ariaLabel="דפדוף בבקשות ההצטרפות שלי"
            firstHref={getDashboardHref({
              leagueCursor: query.leagueCursor as string | undefined,
            })}
            nextHref={
              joinRequests.data.nextCursor
                ? getDashboardHref({
                    leagueCursor: query.leagueCursor as string | undefined,
                    requestCursor: joinRequests.data.nextCursor,
                  })
                : null
            }
            hasCurrentCursor={requestCursor.data !== undefined}
          />
        ) : null}
      </section>
    </main>
  );
}
