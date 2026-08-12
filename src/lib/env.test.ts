import { describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "@/lib/env";

const validInput = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SPORTS_API_PROVIDER: "manual",
  DEMO_MODE: "true",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  CRON_SECRET: "cron_test",
};

describe("Slice 0 environment validation", () => {
  it("accepts a valid manual-provider configuration without a sports key", () => {
    expect(parsePublicEnv(validInput)).toMatchObject({
      SPORTS_API_PROVIDER: "manual",
      DEMO_MODE: true,
    });
    expect(parseServerEnv(validInput).SPORTS_API_KEY).toBeUndefined();
  });

  it("requires a sports key only for an API provider", () => {
    expect(() =>
      parseServerEnv({ ...validInput, SPORTS_API_PROVIDER: "api" }),
    ).toThrow("SPORTS_API_KEY is required");
  });

  it("rejects missing required public configuration", () => {
    expect(() =>
      parsePublicEnv({
        ...validInput,
        NEXT_PUBLIC_SUPABASE_URL: undefined,
      }),
    ).toThrow();

    expect(() =>
      parsePublicEnv({
        ...validInput,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
      }),
    ).toThrow();
  });

  it("rejects malformed DEMO_MODE instead of coercing it to true", () => {
    expect(() =>
      parsePublicEnv({ ...validInput, DEMO_MODE: "yes" }),
    ).toThrow();
  });

  it("does not expose server-only values through the public schema", () => {
    const publicEnv = parsePublicEnv(validInput);

    expect(publicEnv).not.toHaveProperty("SUPABASE_SECRET_KEY");
    expect(publicEnv).not.toHaveProperty("CRON_SECRET");
  });

  it("does not include secret values in validation errors", () => {
    const secret = "sb_secret_do_not_leak";

    try {
      parsePublicEnv({
        ...validInput,
        NEXT_PUBLIC_APP_URL: "not-a-url",
        SUPABASE_SECRET_KEY: secret,
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
