import { redirect } from "next/navigation";

import { getSafeAuthRedirect } from "@/features/auth/redirects";
import { createClient } from "@/lib/supabase/server";

export async function requireAuthenticatedUser(nextPath: unknown) {
  const safeNextPath = getSafeAuthRedirect(nextPath);
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect(`/login?next=${encodeURIComponent(safeNextPath)}`);
  }

  return { supabase, user };
}

export async function redirectAuthenticatedUser(nextPath?: unknown) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(getSafeAuthRedirect(nextPath));
  }
}
