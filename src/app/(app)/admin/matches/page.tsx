import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAuthenticatedUser } from "@/features/auth/session";
import { LocalDateTime } from "@/features/predictions/components/local-date-time";
import {
  DEFAULT_MATCH_TIME_ZONE,
  formatDateTimeInTimeZone,
  getMatchStatusLabel,
} from "@/features/predictions/display";
import { ManualResultForm } from "@/features/scoring/components/manual-result-form";
import { getSystemMatchList } from "@/features/scoring/queries";

export const dynamic = "force-dynamic";

export default async function SystemMatchesPage() {
  const { supabase } = await requireAuthenticatedUser("/admin/matches");
  const result = await getSystemMatchList(supabase);

  if (result.status === "denied") notFound();

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          לא ניתן לטעון את משחקי המערכת כרגע. יש לרענן ולנסות שוב.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">מנהל מערכת</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">ניהול תוצאות</h1>
          <p className="mt-2 max-w-2xl leading-7 text-slate-600">
            תוצאה נשמרת אטומית ומחשבת מחדש את הניקוד בכל הליגות של אותה עונה.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="self-start rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          חזרה לליגות
        </Link>
      </div>

      <aside className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        יש להזין את התוצאה בתום הזמן החוקי בלבד. תיקון מחליף את הניקוד הקודם;
        ביטול מאפס נקודות בלי למחוק ניחושים.
      </aside>

      {result.matches.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          עדיין אין משחקים לעדכון.
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          {result.matches.map((match) => (
            <article
              key={match.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
              aria-labelledby={`match-${match.id}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-500">מחזור {match.roundNumber}</p>
                  <h2 id={`match-${match.id}`} className="mt-1 text-xl font-bold">
                    {match.homeTeamName} — {match.awayTeamName}
                  </h2>
                  <span className="mt-2 block text-sm text-slate-600">
                    <LocalDateTime
                      instant={match.kickoffAt}
                      initialText={formatDateTimeInTimeZone(
                        match.kickoffAt,
                        DEFAULT_MATCH_TIME_ZONE,
                      )}
                      initialTimeZone={DEFAULT_MATCH_TIME_ZONE}
                    />
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-5 gap-y-1 rounded-xl bg-slate-50 p-3 text-sm">
                  <dt className="font-semibold text-slate-600">סטטוס</dt>
                  <dd>{getMatchStatusLabel(match.status)}</dd>
                  <dt className="font-semibold text-slate-600">גרסת תוצאה</dt>
                  <dd>{match.resultVersion}</dd>
                  <dt className="font-semibold text-slate-600">תוצאה</dt>
                  <dd>
                    {match.homeScore === null || match.awayScore === null
                      ? "—"
                      : `${match.homeScore}–${match.awayScore}`}
                  </dd>
                  <dt className="font-semibold text-slate-600">מקור</dt>
                  <dd>{match.isManuallyOverridden ? "הזנה ידנית" : "טרם הוזן ידנית"}</dd>
                </dl>
              </div>
              <ManualResultForm match={match} />
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
