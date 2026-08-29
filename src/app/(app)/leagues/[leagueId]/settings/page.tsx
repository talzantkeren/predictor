import { notFound } from "next/navigation";
import { z } from "zod";

import { DemoNotice } from "@/components/ui/demo-notice";
import { ErrorState } from "@/components/ui/error-state";
import { requireAuthenticatedUser } from "@/features/auth/session";
import { LeagueSettingsForm } from "@/features/leagues/components/league-settings-form";
import { LeagueTabs } from "@/features/leagues/components/league-tabs";
import { getEditableLeagueSettings } from "@/features/leagues/settings-query";
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
  const settingsResult = await getEditableLeagueSettings(supabase, leagueId);

  if (settingsResult.status === "not-found") {
    notFound();
  }

  if (settingsResult.status === "error") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <ErrorState>
          לא ניתן לטעון את הגדרות הליגה כרגע. יש לרענן ולנסות שוב.
        </ErrorState>
      </main>
    );
  }

  const settings = settingsResult.settings;
  const inviteResult =
    settings.editorRole === "manager"
      ? await getLeagueInviteSettings(supabase, leagueId, user.id)
      : null;
  const leagueClosed =
    settings.status === "completed" || settings.status === "archived";
  const applicationOrigin = new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).origin;
  const monogram = settings.name.trim().slice(0, 2) || "P1";

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
              {settings.name}
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-ink sm:text-4xl">
              הגדרות ליגה
            </h1>
            <p className="mt-2 max-w-3xl leading-7 text-ink-secondary">
              עדכון הפרטים המותרים, חלון ההצטרפות וחוקי התחרות לפי מצב הליגה.
            </p>
          </div>
        </div>
      </header>

      <div className="mt-5 overflow-hidden rounded-2xl border border-line shadow-card">
        <LeagueTabs
          leagueId={leagueId}
          active="settings"
          isManager={settings.editorRole === "manager"}
          canManageSettings
        />
      </div>

      <section
        aria-labelledby="editable-league-settings-title"
        className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-card sm:p-8"
      >
        <h2
          id="editable-league-settings-title"
          className="text-2xl font-black text-ink"
        >
          פרטים וחוקי תחרות
        </h2>
        <p className="mt-2 max-w-3xl leading-7 text-ink-secondary">
          שינויי ניקוד ופרסי Demo נשמרים יחד וננעלים לפי זמן ומצב מסד הנתונים.
          פרטי הליגה האחרים נשארים ניתנים לעריכה עד השלמת הליגה.
        </p>

        <div className="mt-7">
          <LeagueSettingsForm settings={settings} />
        </div>
      </section>

      {settings.editorRole === "manager" ? (
        <section
          aria-labelledby="league-invite-settings-title"
          className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-card sm:p-8"
        >
          <h2
            id="league-invite-settings-title"
            className="text-2xl font-black text-ink"
          >
            קישור ההזמנה
          </h2>
          <p className="mt-2 max-w-2xl leading-7 text-ink-secondary">
            הקישור הגולמי מוצג פעם אחת בלבד. החלפת קישור מבטלת מיד את הקישור
            הקודם.
          </p>

          <DemoNotice className="mt-5">
            זהו דמו בלבד — אין להעביר כסף ואין להעלות מסמך פיננסי אמיתי.
          </DemoNotice>

          <div className="mt-7">
            {inviteResult?.status !== "found" ? (
              <ErrorState>
                לא ניתן לטעון את הגדרות ההזמנה כרגע. הגדרות הליגה עדיין זמינות
                לעריכה למעלה.
              </ErrorState>
            ) : leagueClosed ? (
              <p
                role="status"
                className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-warning-900"
              >
                ליגה שהסתיימה או הועברה לארכיון אינה יכולה לקבל הזמנות חדשות.
              </p>
            ) : (
              <InviteControls
                leagueId={settings.id}
                invite={inviteResult.invite}
                applicationOrigin={applicationOrigin}
              />
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
