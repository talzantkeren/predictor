import { AuthCard } from "@/features/auth/components/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { getRecoveryStatusPresentation } from "@/features/auth/auth-flow-results";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const statusPresentation = getRecoveryStatusPresentation(status);

  return (
    <AuthCard
      title="שחזור סיסמה"
      description="הזינו את כתובת האימייל. מטעמי פרטיות, ההודעה המוצגת תהיה זהה בין אם הכתובת רשומה ובין אם לא."
      footer={{
        label: "נזכרתם בסיסמה?",
        linkLabel: "חזרה להתחברות",
        href: "/login",
      }}
    >
      <ForgotPasswordForm statusPresentation={statusPresentation} />
    </AuthCard>
  );
}
