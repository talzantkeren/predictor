import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SPORTS_API_PROVIDER: z.enum(["manual", "api"]).default("manual"),
  DEMO_MODE: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
});

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(1),
  SPORTS_API_KEY: z.string().min(1).optional(),
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
});

const rawPublicEnv = (input: Record<string, string | undefined>) => ({
  NEXT_PUBLIC_APP_URL: input.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: input.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    input.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SPORTS_API_PROVIDER: input.SPORTS_API_PROVIDER,
  DEMO_MODE: input.DEMO_MODE,
});

export function parsePublicEnv(input: Record<string, string | undefined>) {
  return publicEnvSchema.parse(rawPublicEnv(input));
}

export function parseServerEnv(input: Record<string, string | undefined>) {
  const publicEnv = parsePublicEnv(input);
  const serverEnv = serverEnvSchema.parse({
    SUPABASE_SECRET_KEY: input.SUPABASE_SECRET_KEY,
    CRON_SECRET: input.CRON_SECRET,
    SPORTS_API_KEY: input.SPORTS_API_KEY || undefined,
    AI_API_KEY: input.AI_API_KEY || undefined,
    AI_MODEL: input.AI_MODEL || undefined,
  });

  if (publicEnv.SPORTS_API_PROVIDER === "api" && !serverEnv.SPORTS_API_KEY) {
    throw new Error("SPORTS_API_KEY is required when SPORTS_API_PROVIDER=api");
  }

  return { ...publicEnv, ...serverEnv };
}

export function getPublicEnv() {
  return parsePublicEnv(process.env);
}

export function getServerEnv() {
  return parseServerEnv(process.env);
}
