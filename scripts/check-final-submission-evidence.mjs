import { readFile } from "node:fs/promises";

const evidencePath = "docs/final-submission-evidence.md";
const evidence = await readFile(evidencePath, "utf8").catch(() => undefined);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

invariant(evidence, `Missing final-submission evidence register: ${evidencePath}`);
for (const expected of [
  "Status: `OWNER_ACTION_REQUIRED`",
  "`<final-candidate-sha>`",
  "`<final-production-sha>`",
  "Draft PR #14",
  "dpl_Cjza13KogKyyLMbZr972AU5DmbY3",
  "predictor-mew7uo1y9-tals-projects-19902e47.vercel.app",
  "dpl_VtykjW3xjXJcjmpCjH25wZTBP3xn",
  "predictor-2r75rqica-tals-projects-19902e47.vercel.app",
  "recent account payments have failed or your spending limit needs to be increased",
  "SPORTS_API_KEY",
  "preview,production",
  "20260827180000",
  "Evaluator access",
  "Hosted migration parity",
]) {
  invariant(evidence.includes(expected), `Final-submission evidence is missing: ${expected}`);
}

const ownerRows = [
  "GitHub Actions / billing",
  "Final candidate and CI",
  "Vercel final deployment",
  "Vercel environment cleanup",
  "Hosted migration parity",
  "Evaluator access",
  "Incognito final demo",
];
for (const row of ownerRows) {
  const pattern = new RegExp(`\\| ${row.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} \\|[^\\n]+\\| OWNER_ACTION_REQUIRED \\|`, "u");
  invariant(pattern.test(evidence), `Owner gate is not explicitly OAR: ${row}`);
}

invariant(!/\| (?:GitHub Actions \/ billing|Final candidate and CI|Vercel final deployment|Vercel environment cleanup|Hosted migration parity|Evaluator access|Incognito final demo) \|[^\n]+\| (?:PASS|VERIFIED) \|/u.test(evidence), "An external final gate was marked complete without owner evidence.");
invariant(!/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u.test(evidence), "Final-submission evidence resembles a JWT.");
invariant(
  !/(?:SUPABASE_SECRET_KEY|CRON_SECRET|SPORTS_API_KEY)\s*=\s*\S+/u.test(evidence),
  "Final-submission evidence contains a secret assignment.",
);

console.log(
  "Final-submission register verified: current read-only facts are separated from seven owner-only final gates.",
);
