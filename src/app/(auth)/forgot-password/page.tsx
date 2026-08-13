import { AuthCard } from "@/features/auth/components/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const statusMessage = status
    ? {
        "recovery-error":
          "הקישור אינו תקף או שפג תוקפו. אפשר לבקש קישור חדש.",
        "recovery-browser-mismatch":
          "לא ניתן להשלים את השחזור בדפדפן הזה. יש לבקש כאן קישור חדש ולפתוח אותו באותו דפדפן.",
      }[status]
    : undefined;

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
      <ForgotPasswordForm statusMessage={statusMessage} />
    </AuthCard>
  );
}
