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
    expect(source).toContain("גרסה 2.0");
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

  it("maps every required course artifact to a section of the book", () => {
    const [, submissionMap = ""] = source.split("## מפת ההגשה");
    const requiredArtifacts = [
      "קישור לאפליקציה ב־Vercel",
      "קישור ל־GitHub repository",
      "מסמך אפיון מוצר",
      "מסמך תכנון טכני",
      "מסמך אפיון בדיקות",
      "קוד הבדיקות",
      "מסמך סקייל בסיסי",
      "מסמך אבטחה בסיסית",
      "הוראות הרצה מקומית",
      "מצגת 10–15 דקות",
    ];
    for (const artifact of requiredArtifacts) {
      expect(submissionMap).toContain(artifact);
    }

    // One chapter per course stage, so no stage is silently dropped.
    const stageHeadings = [
      "## 2. בחירת המוצר והערך העסקי",
      "## 3. אפיון מוצר",
      "## 4. ארכיטקטורת התוכנה",
      "## 5. תכנון טכני מפורט",
      "## 6. מימוש המוצר",
      "## 7. אפיון בדיקות",
      "## 8. מימוש בדיקות וראיות",
      "## 9. סקייל בסיסי",
      "## 10. אבטחה בסיסית",
      "## 11. פריסה, הרצה מקומית ומשתני סביבה",
      "## 12. שימוש בסוכני קידוד ואחריות על הקוד",
      "## 13. הכנה להצגת המוצר",
    ];
    for (const heading of stageHeadings) {
      expect(source).toContain(heading);
    }
  });

  it("renders Hebrew at the same size as Latin in every style", () => {
    // Word sizes a right-to-left run from w:szCs, not w:sz. The stock
    // python-docx template ships heading styles with their own w:szCs, so
    // without an explicit override the Hebrew half of a heading renders
    // smaller than the Latin half. Assert the rendered file, not the
    // generator's source, so the check survives a refactor.
    const probe = `
import re, sys, zipfile
styles = zipfile.ZipFile("docs/project-book.docx").read("word/styles.xml").decode("utf-8")
mismatched = []
for style in re.findall(r"<w:style [^>]*w:styleId=\\"([^\\"]+)\\".*?</w:style>", styles, re.S):
    body = re.search(r"<w:style [^>]*w:styleId=\\"" + re.escape(style) + r"\\".*?</w:style>", styles, re.S).group(0)
    sz = re.findall(r"<w:sz w:val=\\"(\\d+)\\"", body)
    sz_cs = re.findall(r"<w:szCs w:val=\\"(\\d+)\\"", body)
    if sz and sz_cs and sz[0] != sz_cs[0]:
        mismatched.append((style, sz[0], sz_cs[0]))
if mismatched:
    sys.exit("Latin/Hebrew size mismatch: " + repr(mismatched))
print("sizes aligned")
`;
    const result = spawnSync("python", ["-c", probe], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("sizes aligned");
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
