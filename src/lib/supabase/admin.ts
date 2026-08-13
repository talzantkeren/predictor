import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getAdminEnv } from "@/lib/env";
import type { Database } from "@/types/database.generated";

export function createAdminClient() {
  const env = getAdminEnv();

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
