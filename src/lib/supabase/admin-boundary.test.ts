import { describe, expect, it } from "vitest";

describe("Supabase admin boundary", () => {
  it("rejects importing the admin client outside a server-only module graph", async () => {
    await expect(import("@/lib/supabase/admin")).rejects.toThrow(
      /cannot be imported from a Client Component/i,
    );
  });
});
