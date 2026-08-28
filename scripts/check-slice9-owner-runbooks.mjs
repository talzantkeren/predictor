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
      "agent-executable post-merge gate",
      "Mechanical artifact map",
      "No owner input, credential",
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
      "Owner input required: `NONE`",
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
  {
    path: "docs/runbooks/slice-9-req-003-final-production-review.md",
    required: [
      "S9-REQ-003",
      "agent-executable post-merge gate",
      "The only owner input required",
      "Mechanical artifact map",
      "gh run view <final-run-id> --json databaseId,attempt,headSha,status,conclusion,jobs,url",
      "gh pr view 14 --json number,isDraft,state,headRefOid,mergeCommit,mergedAt,url",
      "Supabase Dashboard → SQL Editor → New query",
      "supabase_migrations.schema_migrations",
      "3A. Require the system actor designation before application traffic",
      "exactly_one_designated_actor",
      "boundary_binding_ready",
      "sync_actor_matches_designation",
      "Vercel → predictor → Deployments → Production",
      "immutable URL",
      "incognito",
      "evaluator",
      "S9-REQ-003-owner-template.md",
      "npm.cmd run submission:evidence:check",
    ],
  },
  {
    path: "docs/evidence/slice-9/w8/S9-REQ-003-owner-template.md",
    required: [
      "Status: `NOT_RUN`",
      "<final-sha>",
      "<final-run-id>",
      "NOT_CAPTURED",
      "NOT_RUN",
      "approved evaluator identity received",
      "approved Demo access method received",
      "PR #14 merged",
      "merge commit equals final SHA",
      "Hosted migration parity",
      "System actor readiness",
      "exactly_one_designated_actor",
      "boundary_binding_ready",
      "sync_actor_matches_designation",
      "immutable URL",
      "Production alias",
      "evaluator repository access",
      "incognito",
      "Demo-only",
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
  "Owner runbooks verified: the Hosted steps are exact and sanitized; S9-DEF-012 requires no owner input and S9-REQ-003 requires only evaluator identity/access method.",
);
