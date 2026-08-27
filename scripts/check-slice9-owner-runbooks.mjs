import { readFile } from "node:fs/promises";

const artifacts = [
  {
    path: "docs/runbooks/slice-9-def-004-hosted-auth.md",
    required: [
      "S9-DEF-004",
      "single owner action",
      "Authentication → URL Configuration",
      "Authentication → SMTP Settings",
      "Authentication → Email Templates",
      "Authentication → Rate Limits",
      "same-browser callback",
      "old password denied",
      "new password login",
      "429",
      "npm.cmd run test:e2e -- e2e/auth.spec.ts",
      "S9-DEF-004-owner-template.md",
    ],
  },
  {
    path: "docs/evidence/slice-9/w2/S9-DEF-004-owner-template.md",
    required: [
      "Status: `NOT_RUN`",
      "<candidate-sha>",
      "NOT_CAPTURED",
      "NOT_RUN",
      "Production callback",
      "known recovery",
      "unknown recovery",
      "replay denied",
      "old password denied",
      "new password login",
      "429/cooldown",
    ],
  },
  {
    path: "docs/runbooks/slice-9-def-012-production-cron.md",
    required: [
      "S9-DEF-012",
      "single owner action",
      "Supabase Dashboard → SQL Editor → New query",
      "cron.job",
      "net._http_response",
      "public.sync_runs",
      "public.sync_leases",
      "timeout_is_45s",
      "timed_out=false",
      "lease_released=true",
      "npm.cmd run test -- src/app/api/cron/sync/route.test.ts src/features/sync/orchestrator.test.ts",
      "S9-DEF-012-owner-template.md",
    ],
  },
  {
    path: "docs/evidence/slice-9/w5/S9-DEF-012-owner-template.md",
    required: [
      "Status: `NOT_RUN`",
      "<candidate-sha>",
      "NOT_CAPTURED",
      "NOT_RUN",
      "predictor-sports-sync",
      "timeout_is_45s",
      "timed_out",
      "terminal run",
      "lease_released",
      "promotion condition",
    ],
  },
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

const loaded = [];
for (const artifact of artifacts) {
  const value = await readFile(artifact.path, "utf8").catch(() => undefined);
  invariant(value, `Missing owner runbook artifact: ${artifact.path}`);
  for (const expected of artifact.required) {
    invariant(value.includes(expected), `${artifact.path} is missing: ${expected}`);
  }
  invariant(!/\[[xX]\]/u.test(value), `${artifact.path} contains a pre-checked item.`);
  loaded.push(value);
}

const combined = loaded.join("\n");
invariant(
  !/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u.test(combined),
  "Owner runbooks resemble a JWT.",
);
invariant(
  !/(?:SUPABASE_SECRET_KEY|CRON_SECRET|SPORTS_API_KEY|SMTP_PASSWORD)\s*=\s*\S+/u.test(combined),
  "Owner runbooks contain a secret assignment.",
);

console.log(
  "Owner runbooks verified: S9-DEF-004 and S9-DEF-012 each have one exact Hosted action and an empty sanitized evidence template.",
);
