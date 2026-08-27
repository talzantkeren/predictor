import { readFile } from "node:fs/promises";

const evidencePath = "docs/final-submission-evidence.md";
const evidence = await readFile(evidencePath, "utf8").catch(() => undefined);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

invariant(evidence, `Missing final-submission evidence register: ${evidencePath}`);
for (const expected of [
  "Status: `OWNER_ACTION_REQUIRED`",
  "`<final-sha>`",
  "<final-run-id>",
  "Draft PR #14",
  "33090719466",
  "e791f361444eb524099eddebdea1c92d6a3a0cc3",
  "The destination stream closed early",
  "33097585902",
  "33097590476",
  "223de65f083fcbf954c082c6e83c6df2ed14bdca",
  "Lint, typecheck, unit tests and build",
  "Supabase database tests",
  "Playwright core flows",
  "dpl_Cjza13KogKyyLMbZr972AU5DmbY3",
  "predictor-mew7uo1y9-tals-projects-19902e47.vercel.app",
  "dpl_VtykjW3xjXJcjmpCjH25wZTBP3xn",
  "predictor-2r75rqica-tals-projects-19902e47.vercel.app",
  "Billing/spending blocker: RESOLVED",
  "SPORTS_API_KEY",
  "preview,production",
  "20260827180000",
  "Evaluator access",
  "Hosted migration parity",
  "Final Production and evaluator closeout",
  "slice-9-req-003-final-production-review.md",
  "S9-REQ-003-owner-template.md",
]) {
  invariant(evidence.includes(expected), `Final-submission evidence is missing: ${expected}`);
}

const ownerRows = ["Final Production and evaluator closeout"];
for (const row of ownerRows) {
  const pattern = new RegExp(`\\| ${row.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} \\|[^\\n]+\\| OWNER_ACTION_REQUIRED \\|`, "u");
  invariant(pattern.test(evidence), `Owner gate is not explicitly OAR: ${row}`);
}

const oarRows = evidence.match(/^\|[^\n]+\|[^\n]+\| OWNER_ACTION_REQUIRED \|$/gmu) ?? [];
invariant(oarRows.length === 1, `Expected exactly one owner-action row, found ${oarRows.length}.`);
invariant(
  !/\| Final Production and evaluator closeout \|[^\n]+\| (?:PASS|VERIFIED) \|/u.test(evidence),
  "The external final gate was marked complete without owner evidence.",
);
invariant(!/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u.test(evidence), "Final-submission evidence resembles a JWT.");
invariant(
  !/(?:SUPABASE_SECRET_KEY|CRON_SECRET|SPORTS_API_KEY)\s*=\s*\S+/u.test(evidence),
  "Final-submission evidence contains a secret assignment.",
);

console.log(
  "Final-submission register verified: observed CI is recorded and one consolidated Production/evaluator owner action remains.",
);
