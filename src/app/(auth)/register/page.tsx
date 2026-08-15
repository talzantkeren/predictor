import { AuthCard } from "@/features/auth/components/auth-card";
import { RegisterForm } from "@/features/auth/components/register-form";
import { getSafeAuthRedirect } from "@/features/auth/redirects";
import { redirectAuthenticatedUser } from "@/features/auth/session";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = getSafeAuthRedirect(params.next);
  await redirectAuthenticatedUser(nextPath);
  const loginHref =
    nextPath === "/dashboard"
      ? "/login"
      : `/login?next=${encodeURIComponent(nextPath)}`;

  return (
    <AuthCard
      title="יצירת חשבון"
      description="נרשמים עם אימייל וסיסמה, ולאחר מכן מאשרים את כתובת האימייל דרך ההודעה שנשלחת אליכם."
      footer={{
        label: "כבר יש לכם חשבון?",
        linkLabel: "התחברות",
        href: loginHref,
      }}
    >
      <RegisterForm nextPath={nextPath} />
    </AuthCard>
  );
}
