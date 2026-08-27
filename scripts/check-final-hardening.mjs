import { readFile } from "node:fs/promises";

const registerPath = "docs/final-hardening-register.md";
const [register, viewportSpec, scalePlanChecker] = await Promise.all([
  readFile(registerPath, "utf8").catch(() => undefined),
  readFile("e2e/home.spec.ts", "utf8"),
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
  "Hosted password policy",
  "leaked-password protection",
  "Security Advisor",
  "Performance Advisor",
  "clean-clone",
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

const ownerRows = [
  "Hosted password policy",
  "Hosted Advisors",
  "Native 200% zoom",
  "GitHub CI billing",
  "Vercel secret scope",
  "Production Cron",
  "Hosted migration parity",
  "Evaluator access",
  "Human rehearsal",
  "Final Production SHA",
];
for (const row of ownerRows) {
  const line = register
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith(`| ${row} |`));
  const cells = line
    ?.split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
  invariant(
    cells?.[2] === "OWNER_ACTION_REQUIRED",
    `Owner-only hardening gate is not explicitly OAR: ${row}`,
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
  !/eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}/u.test(register),
  "Final hardening register resembles a JWT.",
);
invariant(
  !/(?:SUPABASE_SECRET_KEY|CRON_SECRET|SPORTS_API_KEY)\\s*=\\s*\\S+/u.test(register),
  "Final hardening register contains a server-secret assignment.",
);

console.log(
  "Final hardening contract verified: local gates, scale/UI regressions, accepted-risk fields and ten owner-only gates are explicit.",
);
