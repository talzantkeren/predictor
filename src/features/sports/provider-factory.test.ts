import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSportsProvider } from "@/features/sports/provider-factory";

describe("sports provider factory", () => {
  it("selects only the explicit manual and API-Football implementations", () => {
    expect(createSportsProvider({ provider: "manual" }).providerId).toBe(
      "manual",
    );
    expect(
      createSportsProvider({
        provider: "api-football",
        apiKey: "recorded-test-key",
        transport: async () => new Response("{}"),
      }).providerId,
    ).toBe("api-football");
  });

  it("fails closed before any provider request when the server key is absent", () => {
    expect(() =>
      createSportsProvider({ provider: "api-football" }),
    ).toThrow("not configured");
  });
});
