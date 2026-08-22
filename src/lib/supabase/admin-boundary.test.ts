import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(path);
    }

    return /\.(?:ts|tsx|mts)$/.test(entry.name) ? [path] : [];
  });
}

describe("Supabase admin boundary", () => {
  it("rejects importing the admin client outside a server-only module graph", async () => {
    await expect(import("@/lib/supabase/admin")).rejects.toThrow(
      /cannot be imported from a Client Component/i,
    );
  });

  it("confines the privileged client import to fixed proof, scoring, and sync gateways", () => {
    const repositoryRoot = process.cwd();
    const offenders = sourceFiles(resolve(repositoryRoot, "src"))
      .filter((path) =>
        readFileSync(path, "utf8").includes("@/lib/supabase/admin"),
      )
      .map((path) => relative(repositoryRoot, path).replaceAll("\\", "/"))
      .sort();

    expect(offenders).toEqual([
      "src/features/files/private-proof-storage.ts",
      "src/features/scoring/private-scoring-gateway.ts",
      "src/features/sync/private-sync-gateway.ts",
      "src/lib/supabase/admin-boundary.test.ts",
    ]);
  });

  it("keeps the proof gateway server-only as well", async () => {
    await expect(
      import("@/features/files/private-proof-storage"),
    ).rejects.toThrow(/cannot be imported from a Client Component/i);
  });

  it("keeps the scoring gateway server-only as well", async () => {
    await expect(
      import("@/features/scoring/private-scoring-gateway"),
    ).rejects.toThrow(/cannot be imported from a Client Component/i);
  });

  it("keeps the sync gateway server-only as well", async () => {
    await expect(
      import("@/features/sync/private-sync-gateway"),
    ).rejects.toThrow(/cannot be imported from a Client Component/i);
  });
});
