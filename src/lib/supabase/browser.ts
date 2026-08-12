import { createBrowserClient } from "@supabase/ssr";

import { getBrowserEnv } from "@/lib/env";

export function createClient() {
  const env = getBrowserEnv();

  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
