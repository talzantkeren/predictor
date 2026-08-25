import { LeagueForm } from "@/features/leagues/components/league-form";
import { requireAuthenticatedUser } from "@/features/auth/session";
import { getSeasonOptions } from "@/features/leagues/queries";

export const dynamic = "force-dynamic";

export default async function NewLeaguePage() {
  const { supabase } = await requireAuthenticatedUser("/leagues/new");
  const seasons = await getSeasonOptions(supabase);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <section
        aria-labelledby="new-league-title"
        className="min-w-0 rounded-2xl border border-line bg-white p-5 shadow-card sm:p-8"
      >
        <p className="text-sm font-semibold text-navy-700">ליגה פרטית חדשה</p>
        <h1 id="new-league-title" className="mt-2 text-3xl font-bold tracking-tight">
          יצירת ליגה
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-ink-secondary">
          הגדירו את כללי הליגה. עם השמירה תתווספו אוטומטית כמנהל/ת וכחבר/ה פעיל/ה.
        </p>

        <div className="mt-8">
          {!seasons.ok ? (
            <p role="alert" className="rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-900">
              לא ניתן לטעון את רשימת העונות כרגע. יש לרענן את העמוד ולנסות שוב.
            </p>
          ) : seasons.data.length === 0 ? (
            <p role="status" className="rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900">
              עדיין אין עונה זמינה ליצירת ליגה.
            </p>
          ) : (
            <LeagueForm seasons={seasons.data} />
          )}
        </div>
      </section>
    </main>
  );
}
