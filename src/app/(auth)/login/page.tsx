import { AuthCard } from "@/features/auth/components/auth-card";
import { LoginForm } from "@/features/auth/components/login-form";
import { getLoginStatusPresentation } from "@/features/auth/auth-flow-results";
import { getSafeAuthRedirect } from "@/features/auth/redirects";
import { redirectAuthenticatedUser } from "@/features/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; status?: string }>;
}) {
  const params = await searchParams;
  const nextPath = getSafeAuthRedirect(params.next);
  await redirectAuthenticatedUser(nextPath);
  const statusPresentation = getLoginStatusPresentation(params.status);
  const registerHref =
    nextPath === "/dashboard"
      ? "/register"
      : `/register?next=${encodeURIComponent(nextPath)}`;

  return (
    <AuthCard
      title="התחברות"
      description="התחברו כדי להגיע ללוח האישי ולפרופיל שלכם."
      footer={{
        label: "עדיין אין לכם חשבון?",
        linkLabel: "הרשמה",
        href: registerHref,
      }}
    >
      <LoginForm
        nextPath={nextPath}
        statusPresentation={statusPresentation}
      />
    </AuthCard>
  );
}
