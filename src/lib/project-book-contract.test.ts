import { spawnSync } from "node:child_process";
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
const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);

describe("derived project book contract", () => {
  it("uses rerun counts and the current Slice 8/9 state", () => {
    expect(source).toContain("גרסה 1.3");
    expect(source).toContain("PASS — מטריצת RULES מלאה");
    expect(source).toContain("PASS — מטריצת DATA מלאה");
    expect(source).toContain("PASS — מטריצת FLOWS מלאה");
    expect(source).not.toMatch(/627\/627|1443\/1443|28\/28/u);
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
    expect(packageJson.scripts?.["test:client-secrets"]).toBe(
      "tsx scripts/run-e2e.ts --client-secret-check-only",
    );
    expect(packageJson.scripts?.["test:client-secrets:scan"]).toBe(
      "tsx scripts/check-client-secret-absence.ts",
    );

    const verify = packageJson.scripts?.verify;
    expect(typeof verify).toBe("string");
    expect(verify).toContain("npm run docs:book:check");
    expect(verify).toContain("npm run docs:submission:check");
    expect(verify).toContain("npm run test:client-secrets");
    expect(verify).toContain("npm run test:e2e:run");

    expect(workflow).toContain("uses: actions/setup-python@v6");
    expect(workflow).toContain(
      "run: python -m pip install -r docs/requirements-docs.txt",
    );
    expect(workflow).toContain("run: npm run docs:book:check");
    expect(workflow).toContain("run: npm run docs:submission:check");
    expect(workflow).toContain("run: npm run test:client-secrets");
    expect(workflow.indexOf("run: npm run test:client-secrets")).toBeLessThan(
      workflow.indexOf("run: npm run test:e2e:run"),
    );
  });

  it("regenerates and byte-compares the committed project book", () => {
    const result = spawnSync(
      "python",
      ["scripts/generate-project-book.py", "--check"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain(
      "Generated project book is current and deterministic.",
    );
  });
});
