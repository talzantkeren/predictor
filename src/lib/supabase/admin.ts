import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getAdminEnv } from "@/lib/env";
import type { Database } from "@/types/database.generated";

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function createPrivilegedClient(systemActorId?: string) {
  const env = getAdminEnv();

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      ...(systemActorId
        ? {
            global: {
              headers: { "x-predictor-system-actor": systemActorId },
            },
          }
        : {}),
    },
  );
}

export function createAdminClient() {
  return createPrivilegedClient();
}

export function createSystemActorAdminClient(systemActorId: string) {
  if (!canonicalUuidPattern.test(systemActorId)) {
    throw new Error("System actor identifier must be a canonical UUID.");
  }

  return createPrivilegedClient(systemActorId);
}
