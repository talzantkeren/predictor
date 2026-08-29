import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const runbook = readRepositoryFile(
  "docs/runbooks/slice-9-req-003-final-production-review.md",
);
const template = readRepositoryFile(
  "docs/evidence/slice-9/w8/S9-REQ-003-owner-template.md",
);
const checker = readRepositoryFile("scripts/check-slice9-owner-runbooks.mjs");
const submissionChecker = readRepositoryFile("scripts/check-submission-docs.mjs");

const auditTerms = [
  "working tree, every branch, every tag and the full Git history",
  "being ignored is not itself a scan disposition",
  "an active ignored credential is not skipped",
  "$env:GIT_ATTR_NOSYSTEM='1'",
  "a zero-commit scanner result is invalid, never PASS",
  "PR descriptions and comments",
  "GitHub Actions logs and artifacts",
  "Releases, Issues, evidence files and screenshots",
  "`.env.example` contains names and placeholders only",
  "false positives",
  "finding counts only",
] as const;

const evidenceFields = [
  "pre-public FULL_HISTORY_SECRET_SCAN",
  "ACTIONS_LOGS_AND_ARTIFACTS_AUDIT",
  "ENV_EXAMPLE_PLACEHOLDERS_ONLY",
  "repository visibility PUBLIC",
  "anonymous final SHA parity",
  "anonymous clean clone",
  "BRANCH_PROTECTION_AFTER_VISIBILITY_CHANGE",
  "secret scanning availability and enabled state",
  "push protection availability and enabled state",
  "post-public FULL_HISTORY_SECRET_SCAN",
] as const;

const postPublicationTerms = [
  "Re-query branch protection and rulesets and compare them with the pre-change snapshot",
  "restore the same effective protection",
  "fresh credential-disabled anonymous mirror",
  "rerun the trusted scanner across every ref and the full history",
] as const;

describe("Public repository release contract", () => {
  it("orders the complete Public-release sequence", () => {
    const publicationSection = runbook.slice(
      runbook.indexOf("## 7. Complete the mandatory pre-public publication audit"),
      runbook.indexOf("## 9. Close the post-merge gate"),
    );
    const orderedMarkers = [
      "pre-public FULL_HISTORY_SECRET_SCAN",
      "gh api repos/talzantkeren/predictor/branches/main/protection",
      "Require `visibility=public`",
      "git -c credential.helper= ls-remote",
      "git -c credential.helper= clone",
      "BRANCH_PROTECTION_AFTER_VISIBILITY_CHANGE",
      "secret scanning availability and enabled state",
      "push protection availability and enabled state",
      "post-public FULL_HISTORY_SECRET_SCAN",
    ] as const;
    let previous = -1;

    for (const marker of orderedMarkers) {
      const current = publicationSection.indexOf(marker);
      expect(current, marker).toBeGreaterThan(previous);
      previous = current;
    }

    expect(runbook.indexOf("npm.cmd run docs:submission:check -- --online")).toBeGreaterThan(
      runbook.indexOf("post-public FULL_HISTORY_SECRET_SCAN"),
    );
  });

  it("makes every publication observation mandatory and value-free", () => {
    for (const term of auditTerms) {
      expect(runbook).toContain(term);
      expect(checker).toContain(`"${term}"`);
    }

    for (const term of postPublicationTerms) {
      expect(runbook).toContain(term);
      expect(checker).toContain(`"${term}"`);
    }

    for (const field of evidenceFields) {
      expect(runbook).toContain(field);
      expect(template).toContain(`${field}: NOT_RUN`);
      expect(checker.split(`"${field}"`)).toHaveLength(3);
    }
  });

  it("does not allow private GitHub access to pass the online checker", () => {
    expect(submissionChecker).not.toContain("PRIVATE_AUTH_REQUIRED");
    expect(submissionChecker).not.toContain("privateRepositoryUrl");
    expect(submissionChecker).toContain(
      "throw new Error(`External submission link failed:",
    );
  });
});
