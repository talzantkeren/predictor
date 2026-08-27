import { readFile } from "node:fs/promises";

const registerPath = "docs/final-hardening-register.md";
const [register, viewportSpec, scalePlanChecker] = await Promise.all([
  readFile(registerPath, "utf8").catch(() => undefined),
  readFile("e2e/accessibility-matrix.spec.ts", "utf8"),
  readFile("scripts/check-scale-plans.ts", "utf8"),
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

invariant(register, `Missing final hardening register: ${registerPath}`);
for (const expected of [
  "Status: `OWNER_ACTION_REQUIRED`",
  "S9-REQ-005",
  "npm.cmd run verify",
  "npm.cmd run build",
  "npm.cmd run test:client-secrets",
  "npm.cmd audit --audit-level=low",
  "supabase db lint --local",
  "supabase db reset --local",
  "npm.cmd run types:check",
  "npm.cmd run scale:plans",
  "360 / 390 / 768 / 1024 / 1440",
  "native 200%",
  "three clean E2E repeats",
  "single remaining owner action",
  "Hosted hardening read/export",
  "Hosted password policy",
  "leaked-password protection",
  "Security Advisor",
  "Performance Advisor",
  "clean-clone",
  "TRACKED_BY_RECORD",
  "P0",
  "P1",
  "P2",
  "OWNER_ACTION_REQUIRED",
  "Owner",
  "Target date",
  "Trigger",
]) {
  invariant(register.includes(expected), `Final hardening register is missing: ${expected}`);
}

const ownerLine = register
  .split(/\r?\n/u)
  .find((line) => line.startsWith("| Hosted hardening read/export |"));
const ownerCells = ownerLine
  ?.split("|")
  .map((cell) => cell.trim())
  .filter(Boolean);
invariant(
  ownerCells?.[2] === "OWNER_ACTION_REQUIRED",
  "The single Hosted hardening read/export row is not explicitly OAR.",
);

const ownerActionRows = register
  .split(/\r?\n/u)
  .filter((line) => /^\| [^|]+ \| [^|]+ \| OWNER_ACTION_REQUIRED \|/u.test(line));
invariant(
  ownerActionRows.length === 1,
  `Expected exactly one owner-action row, found ${ownerActionRows.length}.`,
);

for (const row of [
  "Native 200% zoom",
  "Vercel secret scope",
  "Production Cron",
  "Hosted migration parity",
  "Evaluator access",
  "Human rehearsal",
  "Final Production SHA",
]) {
  const line = register
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith(`| ${row} |`));
  const cells = line
    ?.split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
  invariant(
    cells?.[2] === "TRACKED_BY_RECORD",
    `A separately tracked gate is not routed to its own record: ${row}`,
  );
}

for (const width of [360, 390, 768, 1024, 1440]) {
  invariant(
    viewportSpec.includes(`width: ${width}`),
    `Viewport regression is missing the ${width}px width.`,
  );
}
for (const label of [
  "dashboard_leagues_101",
  "eligible_leagues_101",
  "revealed_predictions_202",
  "active_members_201",
]) {
  invariant(scalePlanChecker.includes(label), `Scale plan checker is missing: ${label}`);
}
invariant(
  !/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u.test(register),
  "Final hardening register resembles a JWT.",
);
invariant(
  !/(?:SUPABASE_SECRET_KEY|CRON_SECRET|SPORTS_API_KEY)\s*=\s*\S+/u.test(register),
  "Final hardening register contains a server-secret assignment.",
);
for (const stale of [
  "2a692242c795b3129792b7b7f7cd203c1776f9f9",
  "627/627",
  "28/28",
  "ten owner-only gates",
]) {
  invariant(!register.includes(stale), `Final hardening register contains stale evidence: ${stale}`);
}

console.log(
  "Final hardening contract verified: local gates and dispositions are explicit; exactly one Hosted read/export owner action remains.",
);
