import { AuthCard } from "@/features/auth/components/auth-card";
import { LoginForm } from "@/features/auth/components/login-form";
import { getSafeAuthRedirect } from "@/features/auth/redirects";
import { redirectAuthenticatedUser } from "@/features/auth/session";

export const dynamic = "force-dynamic";

const statusMessages: Record<string, string> = {
  "signed-out": "התנתקת בהצלחה.",
  "password-updated": "הסיסמה עודכנה בהצלחה. אפשר להתחבר עם הסיסמה החדשה.",
  "confirmation-completed":
    "כתובת האימייל אושרה או כבר הייתה מאושרת. כדי להמשיך, יש להתחבר עם הסיסמה שבחרתם.",
  "confirmation-error": "הקישור אינו תקף או שפג תוקפו. יש לבקש קישור חדש.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; status?: string }>;
}) {
  const params = await searchParams;
  const nextPath = getSafeAuthRedirect(params.next);
  await redirectAuthenticatedUser(nextPath);
  const statusMessage = params.status ? statusMessages[params.status] : undefined;
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
      <LoginForm nextPath={nextPath} statusMessage={statusMessage} />
    </AuthCard>
  );
}
