import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepositoryFile = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const readme = readRepositoryFile("README.md");
const deployment = readRepositoryFile("docs/deployment.md");
const combined = `${readme}\n${deployment}`;
const currentPreviewOrigin =
  "https://predictor-git-feature-slice-9-imp-51f991-tals-projects-19902e47.vercel.app";

describe("deployment redirect documentation contract", () => {
  it("documents exact Production and local callbacks without wildcards", () => {
    expect(combined).toContain(
      "https://predictor-swart.vercel.app/auth/confirm",
    );
    expect(combined).toContain("http://localhost:3000/auth/confirm");
    expect(combined).toContain("http://127.0.0.1:3000/auth/confirm");
    expect(combined).not.toMatch(/https?:\/\/[^\s`]+\/\*\*/u);
  });

  it("classifies current Preview Auth as unsupported and unverified", () => {
    expect(readme).toContain(currentPreviewOrigin);
    expect(deployment).toContain(currentPreviewOrigin);
    expect(readme).toContain("Auth לא נתמך ולא מאומת");
    expect(deployment).toContain("אין callback קבוע; Auth לא נתמך ולא מאומת");
    expect(deployment).toContain("<exact-preview-origin>/auth/confirm");
    expect(deployment).toContain("Preview Auth אינו דרישת הקורס");
  });

  it("distinguishes application origin selection from Supabase configuration", () => {
    expect(deployment).toContain("VERCEL_BRANCH_URL");
    expect(deployment).toContain("VERCEL_URL");
    expect(deployment).toContain("NEXT_PUBLIC_APP_URL");
    expect(deployment).toContain("אינה תחליף ל־Redirect URL אצל");
    expect(readme).toContain("[`docs/deployment.md`](./docs/deployment.md)");
  });
});
