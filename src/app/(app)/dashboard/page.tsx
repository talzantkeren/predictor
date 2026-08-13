import Link from "next/link";

import { requireAuthenticatedUser } from "@/features/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, user } = await requireAuthenticatedUser("/dashboard");
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.display_name ?? "משתמש";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <section
        aria-labelledby="dashboard-title"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <p className="text-sm font-semibold text-blue-700">לוח אישי</p>
        <h1 id="dashboard-title" className="mt-2 text-3xl font-bold tracking-tight">
          שלום {displayName}
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">
          ההתחברות פעילה והעמוד מוגן. ניהול ליגות יתווסף ב־Slice הבא; בשלב זה
          אפשר לעדכן את שם התצוגה בפרופיל.
        </p>
        <Link
          href="/profile"
          className="mt-6 inline-flex rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          מעבר לפרופיל
        </Link>
      </section>
    </main>
  );
}
