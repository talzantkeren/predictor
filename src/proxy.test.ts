import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import proxy from "@/proxy";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("proxy environment boundary", () => {
  it("returns a controlled response without secret values when configuration is missing", async () => {
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
});
