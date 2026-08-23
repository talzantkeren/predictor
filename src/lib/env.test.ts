import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getBrowserEnv,
  getEnvironmentErrorVariables,
  parseAdminEnv,
  parseBrowserEnv,
  parseCronEnv,
  parsePublicEnv,
  parseServerEnv,
  parseSportsSyncEnv,
} from "@/lib/env";

const validInput = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SPORTS_API_PROVIDER: "manual",
  DEMO_MODE: "true",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Slice 0 environment validation", () => {
  it("accepts a valid manual-provider configuration without server secrets", () => {
    expect(parsePublicEnv(validInput)).toMatchObject({
      SPORTS_API_PROVIDER: "manual",
      DEMO_MODE: true,
    });
    expect(parseServerEnv(validInput)).toMatchObject({
      SPORTS_API_KEY: undefined,
      CRON_SECRET: undefined,
      SYNC_SYSTEM_ACTOR_ID: undefined,
      SUPABASE_SECRET_KEY: undefined,
    });
  });

  it("requires a sports key only for an API provider", () => {
    expect(() =>
      parseServerEnv({ ...validInput, SPORTS_API_PROVIDER: "api-football" }),
    ).toThrow("SPORTS_API_KEY is required");
  });

  it("rejects missing required browser configuration", () => {
    expect(() =>
      parseBrowserEnv({
        ...validInput,
        NEXT_PUBLIC_SUPABASE_URL: undefined,
      }),
    ).toThrow();

    expect(() =>
      parseBrowserEnv({
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

  it("fails closed when DEMO_MODE is missing", () => {
    expect(() =>
      parsePublicEnv({ ...validInput, DEMO_MODE: undefined }),
    ).toThrow();
  });

  it("does not expose server-only values through either client schema", () => {
    const inputWithSecrets = {
      ...validInput,
      SUPABASE_SECRET_KEY: "sb_secret_test",
      CRON_SECRET: "cron_test",
    };

    expect(parseBrowserEnv(inputWithSecrets)).not.toHaveProperty(
      "SUPABASE_SECRET_KEY",
    );
    expect(parsePublicEnv(inputWithSecrets)).not.toHaveProperty("CRON_SECRET");
  });

  it("does not include secret values in validation errors", () => {
    const secret = "sb_secret_do_not_leak";

    try {
      parseAdminEnv({
        ...validInput,
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        SUPABASE_SECRET_KEY: secret,
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(getEnvironmentErrorVariables(error)).toEqual([
        "NEXT_PUBLIC_SUPABASE_URL",
      ]);
    }
  });

  it("reads browser variables through the static Next.js access boundary", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", validInput.NEXT_PUBLIC_APP_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", validInput.NEXT_PUBLIC_SUPABASE_URL);
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      validInput.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );

    expect(getBrowserEnv()).toEqual({
      NEXT_PUBLIC_APP_URL: validInput.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_SUPABASE_URL: validInput.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        validInput.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
  });

  it("requires the secret key only when the admin client is requested", () => {
    expect(() => parseAdminEnv(validInput)).toThrow();
  });

  it("accepts only a fully configured manual Cron environment", () => {
    expect(
      parseCronEnv({
        ...validInput,
        CRON_SECRET: "local-cron-secret",
        SYNC_SYSTEM_ACTOR_ID: "70000000-0000-4000-8000-000000000007",
      }),
    ).toEqual({
      CRON_SECRET: "local-cron-secret",
      SYNC_SYSTEM_ACTOR_ID: "70000000-0000-4000-8000-000000000007",
      SPORTS_API_PROVIDER: "manual",
      SPORTS_API_KEY: undefined,
    });
  });

  it("defaults an omitted Cron provider to the manual path", () => {
    const inputWithoutProvider: Record<string, string | undefined> = {
      ...validInput,
    };
    delete inputWithoutProvider.SPORTS_API_PROVIDER;

    expect(
      parseCronEnv({
        ...inputWithoutProvider,
        CRON_SECRET: "local-cron-secret",
        SYNC_SYSTEM_ACTOR_ID: "70000000-0000-4000-8000-000000000007",
      }),
    ).toEqual({
      CRON_SECRET: "local-cron-secret",
      SYNC_SYSTEM_ACTOR_ID: "70000000-0000-4000-8000-000000000007",
      SPORTS_API_PROVIDER: "manual",
      SPORTS_API_KEY: undefined,
    });
  });

  it("fails the Cron boundary closed for missing or malformed system actors", () => {
    expect(() =>
      parseCronEnv({ ...validInput, CRON_SECRET: "local-cron-secret" }),
    ).toThrow();
    expect(() =>
      parseCronEnv({
        ...validInput,
        CRON_SECRET: "local-cron-secret",
        SYNC_SYSTEM_ACTOR_ID: "not-a-uuid",
      }),
    ).toThrow();
  });

  it("requires a key at the Cron boundary for API-Football", () => {
    expect(() =>
      parseCronEnv({
        ...validInput,
        SPORTS_API_PROVIDER: "api-football",
        CRON_SECRET: "local-cron-secret",
        SYNC_SYSTEM_ACTOR_ID: "70000000-0000-4000-8000-000000000007",
      }),
    ).toThrow();

    expect(
      parseCronEnv({
        ...validInput,
        SPORTS_API_PROVIDER: "api-football",
        SPORTS_API_KEY: "recorded-test-key",
        CRON_SECRET: "local-cron-secret",
        SYNC_SYSTEM_ACTOR_ID: "70000000-0000-4000-8000-000000000007",
      }),
    ).toMatchObject({
      SPORTS_API_PROVIDER: "api-football",
      SPORTS_API_KEY: "recorded-test-key",
    });
  });

  it("validates the shared admin-trigger provider boundary", () => {
    expect(parseSportsSyncEnv({ SPORTS_API_PROVIDER: "manual" })).toEqual({
      SPORTS_API_PROVIDER: "manual",
      SPORTS_API_KEY: undefined,
    });
    expect(() =>
      parseSportsSyncEnv({ SPORTS_API_PROVIDER: "api-football" }),
    ).toThrow();
  });

  it("attributes a production Demo-mode failure to DEMO_MODE", () => {
    expect(
      getEnvironmentErrorVariables(
        new Error("DEMO_MODE must be true for the public course deployment"),
      ),
    ).toEqual(["DEMO_MODE"]);
  });

  it("does not mislabel an unexpected error as a known variable", () => {
    expect(getEnvironmentErrorVariables(new Error("Unexpected failure"))).toEqual(
      [],
    );
  });
});
