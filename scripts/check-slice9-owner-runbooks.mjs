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
  "Owner runbooks verified: S9-DEF-004 has one exact Hosted Auth action and an empty sanitized evidence template.",
);
