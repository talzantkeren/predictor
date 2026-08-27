import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "docs/project-book-source.md"),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { scripts?: Record<string, unknown> };

describe("derived project book contract", () => {
  it("uses rerun counts and the current Slice 8/9 state", () => {
    expect(source).toContain("גרסה 1.3");
    expect(source).toContain("627/627 ב־48 קבצים");
    expect(source).toContain("1443/1443");
    expect(source).toContain("28/28");
    expect(source).toContain("Slice 9 היא הפרוסה הנוכחית");
    expect(source).toMatch(/\| 8 \| דוח מנהל לא־כספי ומבודד \| הושלם \|/u);
    expect(source).not.toMatch(
      /460 בדיקות|20 תרחישי|Slice 8[\s\S]{0,40}השלב הבא/u,
    );
  });

  it("keeps the evaluator-facing book non-financial and linked to canonical sources", () => {
    expect(source).not.toMatch(/\bAI\b|\bfinance\b|דוח חלוקת פרסים/iu);
    expect(source).toContain("[אפיון המוצר](product.md)");
    expect(source).toContain("[ארכיטקטורה ואבטחה](architecture.md)");
    expect(source).toContain("[תכנית טכנית וסדר בדיקות](technical-plan.md)");
    expect(source).toContain("[הוראות evaluator](evaluator-runbook.md)");
    expect(source).toContain("[חבילת המצגת](../presentation/README.md)");
  });

  it("exposes deterministic generation and drift-check commands", () => {
    expect(packageJson.scripts?.["docs:book"]).toBe(
      "python scripts/generate-project-book.py",
    );
    expect(packageJson.scripts?.["docs:book:check"]).toBe(
      "python scripts/generate-project-book.py --check",
    );
  });
});
