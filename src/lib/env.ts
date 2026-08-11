import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(1),
  SPORTS_API_PROVIDER: z.enum(["manual", "api"]).default("manual"),
  SPORTS_API_KEY: z.string().min(1).optional(),
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
  DEMO_MODE: z.coerce.boolean().default(true),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
  SPORTS_API_PROVIDER: process.env.SPORTS_API_PROVIDER,
  SPORTS_API_KEY: process.env.SPORTS_API_KEY || undefined,
  AI_API_KEY: process.env.AI_API_KEY || undefined,
  AI_MODEL: process.env.AI_MODEL || undefined,
  DEMO_MODE: process.env.DEMO_MODE,
});
