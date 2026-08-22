import { z } from "zod";

type EnvironmentInput = Record<string, string | undefined>;

const optionalValue = (value: string | undefined) => value || undefined;
const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const browserEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const publicEnvSchema = browserEnvSchema.extend({
  SPORTS_API_PROVIDER: z.enum(["manual", "api"]).default("manual"),
  DEMO_MODE: z
    .enum(["true", "false"])
    .transform((value) => value === "true"),
});

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  SYNC_SYSTEM_ACTOR_ID: z
    .string()
    .regex(canonicalUuidPattern, "SYNC_SYSTEM_ACTOR_ID must be a canonical UUID")
    .optional(),
  SPORTS_API_KEY: z.string().min(1).optional(),
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
});

const cronEnvSchema = z.object({
  CRON_SECRET: z.string().min(1),
  SYNC_SYSTEM_ACTOR_ID: z.string().regex(
    canonicalUuidPattern,
    "SYNC_SYSTEM_ACTOR_ID must be a canonical UUID",
  ),
  SPORTS_API_PROVIDER: z.literal("manual"),
});

const adminEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
});

function browserEnvironment(input: EnvironmentInput) {
  return {
    NEXT_PUBLIC_APP_URL: input.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: input.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      input.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

function publicEnvironment(input: EnvironmentInput) {
  return {
    ...browserEnvironment(input),
    SPORTS_API_PROVIDER: input.SPORTS_API_PROVIDER,
    DEMO_MODE: input.DEMO_MODE,
  };
}

export function parseBrowserEnv(input: EnvironmentInput) {
  return browserEnvSchema.parse(browserEnvironment(input));
}

export function parsePublicEnv(input: EnvironmentInput) {
  return publicEnvSchema.parse(publicEnvironment(input));
}

export function parseServerEnv(input: EnvironmentInput) {
  const publicEnv = parsePublicEnv(input);
  const serverEnv = serverEnvSchema.parse({
    SUPABASE_SECRET_KEY: optionalValue(input.SUPABASE_SECRET_KEY),
    CRON_SECRET: optionalValue(input.CRON_SECRET),
    SYNC_SYSTEM_ACTOR_ID: optionalValue(input.SYNC_SYSTEM_ACTOR_ID),
    SPORTS_API_KEY: optionalValue(input.SPORTS_API_KEY),
    AI_API_KEY: optionalValue(input.AI_API_KEY),
    AI_MODEL: optionalValue(input.AI_MODEL),
  });

  if (publicEnv.SPORTS_API_PROVIDER === "api" && !serverEnv.SPORTS_API_KEY) {
    throw new Error("SPORTS_API_KEY is required when SPORTS_API_PROVIDER=api");
  }

  return { ...publicEnv, ...serverEnv };
}

export function parseAdminEnv(input: EnvironmentInput) {
  return adminEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: input.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SECRET_KEY: input.SUPABASE_SECRET_KEY,
  });
}

export function parseCronEnv(input: EnvironmentInput) {
  return cronEnvSchema.parse({
    CRON_SECRET: optionalValue(input.CRON_SECRET),
    SYNC_SYSTEM_ACTOR_ID: optionalValue(input.SYNC_SYSTEM_ACTOR_ID),
    SPORTS_API_PROVIDER: input.SPORTS_API_PROVIDER,
  });
}

export function getEnvironmentErrorVariables(error: unknown) {
  if (error instanceof z.ZodError) {
    return [...new Set(error.issues.flatMap((issue) => {
      const [variable] = issue.path;
      return typeof variable === "string" ? [variable] : [];
    }))];
  }

  if (error instanceof Error && error.message.startsWith("SPORTS_API_KEY")) {
    return ["SPORTS_API_KEY"];
  }

  if (error instanceof Error && error.message.startsWith("DEMO_MODE")) {
    return ["DEMO_MODE"];
  }

  return [];
}

export function getBrowserEnv() {
  // Next.js replaces only statically referenced NEXT_PUBLIC_* variables in the
  // browser bundle. Keep these accesses explicit rather than indexing process.env.
  return parseBrowserEnv({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function getPublicEnv() {
  return parsePublicEnv({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SPORTS_API_PROVIDER: process.env.SPORTS_API_PROVIDER,
    DEMO_MODE: process.env.DEMO_MODE,
  });
}

export function getServerEnv() {
  return parseServerEnv({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SPORTS_API_PROVIDER: process.env.SPORTS_API_PROVIDER,
    DEMO_MODE: process.env.DEMO_MODE,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    SYNC_SYSTEM_ACTOR_ID: process.env.SYNC_SYSTEM_ACTOR_ID,
    SPORTS_API_KEY: process.env.SPORTS_API_KEY,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
  });
}

export function getAdminEnv() {
  return parseAdminEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
}

export function getCronEnv() {
  return parseCronEnv({
    CRON_SECRET: process.env.CRON_SECRET,
    SYNC_SYSTEM_ACTOR_ID: process.env.SYNC_SYSTEM_ACTOR_ID,
    SPORTS_API_PROVIDER: process.env.SPORTS_API_PROVIDER,
  });
}
