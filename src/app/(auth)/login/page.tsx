import { AuthCard } from "@/features/auth/components/auth-card";
import { LoginForm } from "@/features/auth/components/login-form";
import { getSafeAuthRedirect } from "@/features/auth/redirects";
import { redirectAuthenticatedUser } from "@/features/auth/session";

export const dynamic = "force-dynamic";

const statusMessages: Record<string, string> = {
  "signed-out": "התנתקת בהצלחה.",
  "password-updated": "הסיסמה עודכנה בהצלחה. אפשר להתחבר עם הסיסמה החדשה.",
  "confirmation-error": "הקישור אינו תקף או שפג תוקפו. יש לבקש קישור חדש.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; status?: string }>;
}) {
  await redirectAuthenticatedUser();
  const params = await searchParams;
  const nextPath = getSafeAuthRedirect(params.next);
  const statusMessage = params.status ? statusMessages[params.status] : undefined;

  return (
    <AuthCard
      title="התחברות"
      description="התחברו כדי להגיע ללוח האישי ולפרופיל שלכם."
      footer={{
        label: "עדיין אין לכם חשבון?",
        linkLabel: "הרשמה",
        href: "/register",
      }}
    >
      <LoginForm nextPath={nextPath} statusMessage={statusMessage} />
    </AuthCard>
  );
}
