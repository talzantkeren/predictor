import { ProfileForm } from "@/features/auth/components/profile-form";
import { requireAuthenticatedUser } from "@/features/auth/session";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { supabase, user } = await requireAuthenticatedUser("/profile");
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <section
        aria-labelledby="profile-title"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <p className="text-sm font-semibold text-blue-700">החשבון שלי</p>
        <h1 id="profile-title" className="mt-2 text-3xl font-bold tracking-tight">
          פרופיל
        </h1>
        <p className="mt-3 text-slate-600">
          כאן אפשר לשנות רק את שם התצוגה המשויך לחשבון.
        </p>

        <div className="mt-7">
          {error || !profile ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              לא ניתן לטעון את הפרופיל כרגע. יש לרענן את העמוד ולנסות שוב.
            </p>
          ) : (
            <ProfileForm displayName={profile.display_name} />
          )}
        </div>
      </section>
    </main>
  );
}
