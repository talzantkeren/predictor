import { AuthCard } from "@/features/auth/components/auth-card";
import { RegisterForm } from "@/features/auth/components/register-form";
import { redirectAuthenticatedUser } from "@/features/auth/session";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  await redirectAuthenticatedUser();

  return (
    <AuthCard
      title="יצירת חשבון"
      description="נרשמים עם אימייל וסיסמה, ולאחר מכן מאשרים את כתובת האימייל דרך ההודעה שנשלחת אליכם."
      footer={{
        label: "כבר יש לכם חשבון?",
        linkLabel: "התחברות",
        href: "/login",
      }}
    >
      <RegisterForm />
    </AuthCard>
  );
}
