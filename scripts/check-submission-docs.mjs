import { access, readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";

const online = process.argv.includes("--online");
const repositoryRoot = process.cwd();
const documentPaths = [
  "README.md",
  "docs/testing.md",
  "docs/security.md",
  "docs/scale.md",
  "docs/deployment.md",
  "docs/project-book-source.md",
  "docs/project-book-workflow.md",
  "docs/course-source.md",
  "docs/evaluator-runbook.md",
  "docs/final-submission-evidence.md",
  "docs/slice-9-delivery-ledger.md",
  "docs/slice-9-owner-actions.md",
  "docs/slice-9-review-packet.md",
  "presentation/README.md",
  "presentation/demo-script.md",
  "presentation/rehearsal-log.md",
];
function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readRequired(relativePath) {
  const content = await readFile(path.join(repositoryRoot, relativePath), "utf8").catch(
    () => undefined,
  );
  invariant(content, `Missing submission document: ${relativePath}`);
  return content;
}

function extractMarkdownTargets(markdown) {
  return [...markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)].map((match) =>
    match[1].trim().replace(/^<|>$/gu, ""),
  );
}

function stripFragmentAndQuery(target) {
  return target.split("#", 1)[0].split("?", 1)[0];
}

function requestExternalUrl(url, redirects = 0) {
  invariant(redirects <= 10, `External submission link redirected too many times: ${url}`);

  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "https:" ? https : http;
    const request = transport.get(
      target,
      { headers: { "user-agent": "Predictor1-submission-link-check/1.0" } },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        response.resume();
        response.once("end", () => {
          if (status >= 300 && status < 400 && location) {
            resolve(requestExternalUrl(new URL(location, target).toString(), redirects + 1));
            return;
          }
          resolve({ effectiveUrl: target.toString(), status });
        });
      },
    );
    request.setTimeout(20_000, () => {
      request.destroy(new Error(`External submission link timed out: ${url}`));
    });
    request.once("error", reject);
  });
}

async function checkExternalUrl(url) {
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/u.test(url)) {
    return { url, status: "LOCAL_ONLY" };
  }

  const response = await requestExternalUrl(url);
  if (response.status >= 200 && response.status < 300) {
    return { url, status: response.status };
  }

  throw new Error(`External submission link failed: ${url} (${response.status})`);
}

const documents = new Map(
  await Promise.all(documentPaths.map(async (relativePath) => [relativePath, await readRequired(relativePath)])),
);
const localLinks = [];
const externalLinks = new Set();

for (const [sourcePath, markdown] of documents) {
  for (const target of extractMarkdownTargets(markdown)) {
    if (/^https?:\/\//u.test(target)) {
      externalLinks.add(stripFragmentAndQuery(target));
      continue;
    }
    if (target.startsWith("#") || target.startsWith("mailto:")) continue;
    const relativeTarget = decodeURIComponent(stripFragmentAndQuery(target));
    if (!relativeTarget) continue;
    const resolved = path.resolve(repositoryRoot, path.dirname(sourcePath), relativeTarget);
    invariant(
      resolved === repositoryRoot || resolved.startsWith(`${repositoryRoot}${path.sep}`),
      `Submission link escapes the repository: ${sourcePath} -> ${target}`,
    );
    await access(resolved).catch(() => {
      throw new Error(`Broken local submission link: ${sourcePath} -> ${target}`);
    });
    localLinks.push(`${sourcePath} -> ${target}`);
  }
}

const readme = documents.get("README.md");
const testing = documents.get("docs/testing.md");
const security = documents.get("docs/security.md");
const scale = documents.get("docs/scale.md");
const projectBookSource = documents.get("docs/project-book-source.md");
const evaluator = documents.get("docs/evaluator-runbook.md");
const courseSource = documents.get("docs/course-source.md");
const ownerActions = documents.get("docs/slice-9-owner-actions.md");
const deliveryLedger = documents.get("docs/slice-9-delivery-ledger.md");
const reviewPacket = documents.get("docs/slice-9-review-packet.md");

invariant(!readme.includes("מצב נוכחי: Slice 8"), "README still describes Slice 8 as current.");
invariant(!readme.includes("מתוכננות ל־Slice 9"), "README still describes lifecycle as future work.");
for (const forbidden of ["Slice 10", "RELEASE_READY", "דוח פיננסי אמיתי"]) {
  invariant(
    ![readme, testing, projectBookSource, evaluator].some((value) => value.includes(forbidden)),
    `Submission docs contain forbidden delivery claim: ${forbidden}`,
  );
}

for (const expected of [
  "גרסה 1.3",
  "PASS — מטריצת RULES מלאה",
  "PASS — מטריצת DATA מלאה",
  "PASS — מטריצת FLOWS מלאה",
  "evaluator-runbook.md",
]) {
  invariant(projectBookSource.includes(expected), `Project-book source is missing: ${expected}`);
}
invariant(
  !/627\/627|1443\/1443|28\/28/u.test(projectBookSource),
  "Project-book source contains obsolete point-in-time test totals.",
);
for (const expected of [
  "## Snapshot מסירה — S9-REQ-004",
  "PASS — RULES suite מלאה",
  "PASS — DATA suite מלאה",
  "PASS — FLOWS matrix מלאה",
]) {
  invariant(testing.includes(expected), `Testing snapshot is missing: ${expected}`);
}
const deliverySnapshot = testing.split("## Snapshot מסירה — S9-REQ-004", 2)[1]?.split("\n## ", 1)[0] ?? "";
invariant(
  !/627\/627|1443\/1443|28\/28/u.test(deliverySnapshot),
  "Current testing snapshot contains obsolete point-in-time totals.",
);
for (const expected of ["OWNER_ACTION_REQUIRED", "השירות המובנה", "Chrome Zoom=200%", "SPORTS_API_KEY"]) {
  invariant(evaluator.includes(expected), `Evaluator runbook is missing owner guidance: ${expected}`);
}
const trackedOwnerRecordIds = [
  "S9-DEF-025",
  "S9-DEF-022",
  "S9-REQ-003",
  "S9-DEF-012",
  "S9-REQ-005",
  "S9-DEF-004",
  "S9-REQ-002",
];
for (const id of trackedOwnerRecordIds) {
  invariant(ownerActions.includes(id), `Owner-actions document is missing: ${id}`);
}
for (const expected of ["בדיוק חמש רשומות", "איפה", "ראיה לשמור", "אימות לאחר הפעולה"]) {
  invariant(ownerActions.includes(expected), `Owner-actions document is missing contract text: ${expected}`);
}
const deliveryRecordIds = [
  "S9-DEF-002", "S9-DEF-001", "S9-DEF-004", "S9-DEF-003", "S9-DEF-007",
  "S9-DEF-008", "S9-DEF-009", "S9-REQ-001", "S9-DEF-010", "S9-DEF-011",
  "S9-DEF-012", "S9-DEF-018", "S9-DEF-019", "S9-DEF-025", "S9-DEF-015",
  "S9-DEF-016", "S9-DEF-020", "S9-DEF-022", "S9-DEF-024", "S9-DEF-013",
  "S9-DEF-014", "S9-REQ-002", "S9-REQ-004", "S9-REQ-003", "S9-REQ-005",
];
for (const id of deliveryRecordIds) {
  invariant(reviewPacket.includes(`| ${id} |`), `Review packet is missing record row: ${id}`);
}
const currentLedgerSection = deliveryLedger.split("## Final closeout", 1)[0];
const currentLedgerRows = currentLedgerSection
  .split(/\r?\n/u)
  .filter((line) => /^\| S9-(?:DEF|REQ)-\d{3} \|/u.test(line));
const verifiedLedgerRows = currentLedgerRows.filter((line) => line.includes("| VERIFIED |"));
const ownerLedgerRows = currentLedgerRows.filter((line) =>
  line.includes("| OWNER_ACTION_REQUIRED |"),
);
invariant(currentLedgerRows.length === 25, `Expected 25 delivery rows, found ${currentLedgerRows.length}.`);
invariant(
  verifiedLedgerRows.length === 20 && ownerLedgerRows.length === 5,
  `Expected 20 VERIFIED and 5 OWNER_ACTION_REQUIRED rows, found ${verifiedLedgerRows.length}/${ownerLedgerRows.length}.`,
);
for (const [id, status] of [
  ["S9-REQ-005", "VERIFIED"],
  ["S9-DEF-025", "VERIFIED"],
  ["S9-DEF-022", "OWNER_ACTION_REQUIRED"],
]) {
  invariant(
    currentLedgerRows.some((row) => row.startsWith(`| ${id} |`) && row.includes(`| ${status} |`)),
    `Delivery ledger has the wrong final status for ${id}.`,
  );
  invariant(
    reviewPacket.includes(`| ${id} | ${status} |`),
    `Review packet has the wrong final status for ${id}.`,
  );
}
for (const id of ["S9-DEF-004", "S9-DEF-012", "S9-DEF-022", "S9-REQ-002", "S9-REQ-003"]) {
  invariant(
    ownerLedgerRows.some((row) => row.startsWith(`| ${id} |`)),
    `Expected open delivery record is missing: ${id}`,
  );
}
for (const expected of [
  "Look here first",
  "lifecycle completion atomicity",
  "canonical lock ordering",
  "RLS and least-privilege grants",
  "reconciliation path",
]) {
  invariant(reviewPacket.includes(expected), `Review packet is missing reviewer guidance: ${expected}`);
}
for (const expected of ["git clone", "git checkout --detach <candidate-sha>", "npm ci", "supabase start"]) {
  invariant(evaluator.includes(expected), `Evaluator runbook is missing clean-clone step: ${expected}`);
}
for (const expected of ["סיכונים שיוריים ופעולות owner למסירה", "OWNER_ACTION_REQUIRED"]) {
  invariant(security.includes(expected), `Security residual-risk section is missing: ${expected}`);
}
for (const expected of ["keyset יציב של 25", "תקציב 120 שניות"]) {
  invariant(scale.includes(expected), `Scale contract is missing: ${expected}`);
}
for (const expected of [
  "מספר עמודים | `9`",
  "19b5dabc8e3f359d69b82bd0a0674740ba8704273b80602d3d7a25706557f39c",
]) {
  invariant(courseSource.includes(expected), `Course-source manifest drifted: ${expected}`);
}
await access(path.join(repositoryRoot, "Internet Technologies.pdf")).then(
  () => {
    throw new Error("The access-controlled course PDF must not be tracked in the repository root.");
  },
  () => undefined,
);

const submissionText = [...documents.values()].join("\n");
invariant(!/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u.test(submissionText), "Submission docs resemble a JWT.");
invariant(
  !/(?:SUPABASE_SECRET_KEY|CRON_SECRET|SPORTS_API_KEY)\s*=\s*\S+/u.test(submissionText),
  "Submission docs contain a server-secret assignment.",
);

const externalResults = [];
if (online) {
  for (const url of [...externalLinks].sort()) {
    externalResults.push(await checkExternalUrl(url));
  }
}

console.log(
  `Submission docs verified: ${documentPaths.length} documents, ${localLinks.length} local links, ${externalLinks.size} external links${online ? " checked online" : " inventoried"}.`,
);
for (const result of externalResults) {
  console.log(`${result.status} ${result.url}`);
}
