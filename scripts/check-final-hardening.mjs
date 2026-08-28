import { readFile } from "node:fs/promises";

const registerPath = "docs/final-hardening-register.md";
const securityExportPath =
  "docs/evidence/slice-9/w8/S9-REQ-005-security-advisor.md";
const performanceExportPath =
  "docs/evidence/slice-9/w8/S9-REQ-005-performance-advisor.md";
const authPolicyPath =
  "docs/evidence/slice-9/w8/S9-REQ-005-hosted-auth-policy.md";
const [
  register,
  securityExport,
  performanceExport,
  authPolicy,
  viewportSpec,
  playwrightConfig,
  e2eRunner,
  packageManifest,
  scalePlanChecker,
] = await Promise.all([
  readFile(registerPath, "utf8").catch(() => undefined),
  readFile(securityExportPath, "utf8").catch(() => undefined),
  readFile(performanceExportPath, "utf8").catch(() => undefined),
  readFile(authPolicyPath, "utf8").catch(() => undefined),
  readFile("e2e/accessibility-matrix.spec.ts", "utf8"),
  readFile("playwright.config.ts", "utf8"),
  readFile("scripts/run-e2e.ts", "utf8"),
  readFile("package.json", "utf8"),
  readFile("scripts/check-scale-plans.ts", "utf8"),
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

invariant(register, `Missing final hardening register: ${registerPath}`);
for (const expected of [
  "Status: `VERIFIED`",
  "S9-REQ-005",
  "npm.cmd run build",
  "supabase db reset --local",
  "npm.cmd run types:check",
  "1502/1502",
  "624/624",
  "72 בתים",
  "28/28",
  "20/20",
  "20260825000000_revoke_rls_event_trigger_rpc_access.sql",
  "rls_auto_enable",
  "leaked-password protection",
  "Security Advisor",
  "Performance Advisor",
  "TRACKED_BY_RECORD",
  "P0",
  "P1",
  "P2",
  "Owner",
  "Target date",
  "Trigger",
]) {
  invariant(register.includes(expected), `Final hardening register is missing: ${expected}`);
}

const ownerActionRows = register
  .split(/\r?\n/u)
  .filter((line) => /^\| [^|]+ \| [^|]+ \| OWNER_ACTION_REQUIRED \|/u.test(line));
invariant(
  ownerActionRows.length === 0,
  `Expected no S9-REQ-005 owner-action row, found ${ownerActionRows.length}.`,
);

for (const [path, artifact] of [
  [securityExportPath, securityExport],
  [performanceExportPath, performanceExport],
  [authPolicyPath, authPolicy],
]) {
  invariant(artifact, `Missing Hosted hardening export: ${path}`);
  invariant(artifact.includes("Status: `VERIFIED`"), `${path} is not VERIFIED.`);
}

const securityRows = securityExport
  .split(/\r?\n/u)
  .filter((line) => /^\| S\d{2} \|/u.test(line));
const performanceRows = performanceExport
  .split(/\r?\n/u)
  .filter((line) => /^\| P\d{2} \|/u.test(line));
invariant(
  securityRows.length === 28,
  `Expected 28 Security Advisor dispositions, found ${securityRows.length}.`,
);
invariant(
  performanceRows.length === 20,
  `Expected 20 Performance Advisor dispositions, found ${performanceRows.length}.`,
);
for (const row of [...securityRows, ...performanceRows]) {
  invariant(
    /`(?:FIXED|NO-FIX WITH EVIDENCE|NO-ADD WITH EVIDENCE|RETAIN WITH EVIDENCE|ACCEPTED WITH RATIONALE)`/u.test(
      row,
    ),
    `Advisor row lacks an allowed explicit disposition: ${row}`,
  );
}
for (const expected of [
  "password_min_length",
  "72` UTF-8 bytes",
  "password_hibp_enabled",
  "`false`",
  "S9-TDEC-004",
]) {
  invariant(authPolicy.includes(expected), `Hosted Auth export is missing: ${expected}`);
}

for (const row of [
  "Chrome page zoom 200%",
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
for (const expected of [
  "accessibilityMatrixOrder",
  ".ariaSnapshot()",
  "observedFocusOrder",
  'result.id === "color-contrast"',
  "deviceScaleFactor: 2",
  "height: 450",
  "width: 720",
  'route: "/admin/matches"',
  'route: "/admin/sync"',
  'artifactName: "league-members"',
  'artifactName: "league-settings"',
  "assertInvalidRejectionState",
  "manuallyMeasuredSelectors",
  "element.labels",
  "storageState: await manager.context.storageState()",
  "hasTouch: descriptor.hasTouch",
  "isMobile: descriptor.isMobile",
  "Browser.getBrowserCommandLine",
  "visualViewportScale",
  "viewportEmulation: false",
  "clippedTargets",
  "overlappingTargets",
]) {
  invariant(
    viewportSpec.includes(expected),
    `Viewport regression is missing the explicit accessibility contract: ${expected}`,
  );
}
for (const expected of [
  'process.env.S9_NATIVE_SCALE_AUDIT === "1"',
  "viewport: null",
  '"--force-device-scale-factor=2"',
  "`--window-size=${viewport.width},${viewport.height}`",
]) {
  invariant(
    playwrightConfig.includes(expected),
    `Native-scale Playwright configuration is missing: ${expected}`,
  );
}
for (const expected of [
  'process.argv.includes("--native-scale-audit")',
  'S9_NATIVE_SCALE_AUDIT: "1"',
]) {
  invariant(
    e2eRunner.includes(expected),
    `Native-scale E2E runner is missing: ${expected}`,
  );
}
invariant(
  packageManifest.includes('"test:a11y:native-scale"'),
  "The native-scale accessibility command is missing from package.json.",
);
invariant(
  !/\btest(?:\.describe)?\.(?:skip|fixme|only|fail)\b/u.test(viewportSpec) &&
    !/\btestInfo\.skip\s*\(/u.test(viewportSpec) &&
    !/\btest\.describe\.configure\s*\(\s*\{[^}]*\bmode\s*:\s*["']skip["']/su.test(
      viewportSpec,
    ),
  "Viewport regression must not skip, disable, isolate or mark an accessibility check as an expected failure.",
);
invariant(
  !viewportSpec.includes("isInlineTextLink"),
  "Viewport regression must not restore the blanket inline-link touch-target exemption.",
);
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
  "ten owner-only gates",
  "single remaining owner action",
]) {
  invariant(!register.includes(stale), `Final hardening register contains stale evidence: ${stale}`);
}

console.log(
  "Final hardening contract verified: Hosted Auth and all 48 Advisor dispositions are explicit; S9-REQ-005 has no remaining owner action.",
);
