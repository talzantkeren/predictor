import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import proxy from "@/proxy";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("proxy environment boundary", () => {
  it("returns a controlled response without secret values when configuration is missing", async () => {
    // NEXT_PUBLIC_* values are embedded in a real Next.js production build.
    // This unit test covers the parser/response boundary; runtime-only values
    // such as DEMO_MODE exercise the same response path after deployment.
    const secret = "secret-that-must-not-leak";
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", secret);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await proxy(new NextRequest("http://localhost:3000/"));
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toContain("configuration_error");
    expect(body).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(body).not.toContain(secret);
    expect(consoleError).toHaveBeenCalledOnce();
    expect(String(consoleError.mock.calls[0])).not.toContain(secret);
  });

  it("does not expose environment variable names in a production response", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "sb_publishable_test",
    );
    vi.stubEnv("DEMO_MODE", "invalid");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await proxy(new NextRequest("http://localhost:3000/"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: "configuration_error",
      variables: [],
    });
    expect(JSON.stringify(body)).not.toContain("DEMO_MODE");
  });
});
