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
  "2fc9a36ed5e8adc101ebef6c4a42796a0abe5690",
  "Manual ללא Sports key",
  "מזהי project/deployment",
  "Billing/spending blocker: RESOLVED",
  "SPORTS_API_KEY",
  "Production only; all branches",
  "No Preview or branch-specific association",
  "Manual workflow; no key entry",
  "39 migrations",
  "20260825000000_revoke_rls_event_trigger_rpc_access.sql",
  "19 migrations של Slice 9 נשארו local-only",
  "Public repository access",
  "Hosted migration parity",
  "Final Production, Public and package closeout",
  "slice-9-req-003-final-production-review.md",
  "S9-REQ-003-owner-template.md",
  "Predictor1_Project_Book_HE_v2.1.pdf",
  "Predictor1_Project_Book_HE_v2.1.docx",
  "Predictor1_Final_Presentation_HE.pptx",
  "DBA0AE5F200394A70BDDF65E7229C0443F8D8145D9704096986AA73CB8F5D0EA",
  "73FB802509CD8D18579079FD05B8B9817C44D1A75543566F09D27581C998318D",
  "8B805B3C735C14A03BDE2BC3830F011842842549150B7E37A8E7F62C5D40B62C",
  "FINAL_SUBMISSION_DIRECTORY: NOT_RUN",
  "LINKS_FINAL_SHA_AND_PUBLIC_URLS: NOT_RUN",
  "ZIP_ROOT_SHAPE: NOT_RUN",
  "ZIP_EXTRACT_REOPEN_HASH_LINK_SECRET_QA: NOT_RUN",
  "byte-for-byte",
]) {
  invariant(evidence.includes(expected), `Final-submission evidence is missing: ${expected}`);
}

const ownerRows = ["Final Production, Public and package closeout"];
for (const row of ownerRows) {
  const pattern = new RegExp(`\\| ${row.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} \\|[^\\n]+\\| OWNER_ACTION_REQUIRED \\|`, "u");
  invariant(pattern.test(evidence), `Owner gate is not explicitly OAR: ${row}`);
}

const oarRows = evidence.match(/^\|[^\n]+\|[^\n]+\| OWNER_ACTION_REQUIRED \|$/gmu) ?? [];
invariant(oarRows.length === 1, `Expected exactly one owner-action row, found ${oarRows.length}.`);
invariant(
  !/\| Final Production, Public and package closeout \|[^\n]+\| (?:PASS|VERIFIED) \|/u.test(evidence),
  "The external final gate was marked complete without owner evidence.",
);
invariant(!/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u.test(evidence), "Final-submission evidence resembles a JWT.");
invariant(
  !/(?:SUPABASE_SECRET_KEY|CRON_SECRET|SPORTS_API_KEY)\s*=\s*\S+/u.test(evidence),
  "Final-submission evidence contains a secret assignment.",
);
for (const stale of [
  "preview,production",
  "dpl_Cjza13KogKyyLMbZr972AU5DmbY3",
  "dpl_VtykjW3xjXJcjmpCjH25wZTBP3xn",
]) {
  invariant(!evidence.includes(stale), `Final-submission evidence contains stale Hosted state: ${stale}`);
}

console.log(
  "Final-submission register verified: observed CI and frozen artifact bytes are recorded, and one consolidated Production/Public/package owner action remains.",
);
