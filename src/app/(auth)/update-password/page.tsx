import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AuthCard } from "@/features/auth/components/auth-card";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";
import { requireAuthenticatedUser } from "@/features/auth/session";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  await requireAuthenticatedUser("/update-password");
  const cookieStore = await cookies();

  if (cookieStore.get("predictor_recovery")?.value !== "active") {
    redirect("/forgot-password?status=recovery-error");
  }

  return (
    <AuthCard
      title="בחירת סיסמה חדשה"
      description="בחרו סיסמה חדשה באורך 8 תווים לפחות. לאחר השמירה תתבקשו להתחבר מחדש."
    >
      <UpdatePasswordForm />
    </AuthCard>
  );
}
