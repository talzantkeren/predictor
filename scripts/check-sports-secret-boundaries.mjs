import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const workflowPath = ".github/workflows/ci.yml";
const examplePath = ".env.example";
const matrixPath =
  "docs/evidence/slice-9/w5/S9-DEF-025-environment-scope-matrix.md";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return [path];
    }),
  );
  return nested.flat();
}

const [
  workflow,
  example,
  matrix,
  files,
  apiFootballClientTest,
  providerFactoryTest,
  providerPoc,
  syncE2e,
] = await Promise.all([
  readFile(workflowPath, "utf8"),
  readFile(examplePath, "utf8"),
  readFile(matrixPath, "utf8").catch(() => undefined),
  sourceFiles("src"),
  readFile("src/features/sports/api-football-client.test.ts", "utf8"),
  readFile("src/features/sports/provider-factory.test.ts", "utf8"),
  readFile("scripts/sports-provider-poc.ts", "utf8"),
  readFile("e2e/sync.spec.ts", "utf8"),
]);

invariant(
  /SPORTS_API_PROVIDER:\s*manual/u.test(workflow),
  "CI must pin the Sports provider to Manual.",
);
invariant(
  !/SPORTS_API_KEY\s*:/u.test(workflow),
  "CI must not define the Sports provider credential.",
);
invariant(
  /^SPORTS_API_PROVIDER=manual$/mu.test(example),
  "The local environment contract must default to Manual.",
);
invariant(
  /^SPORTS_API_KEY=$/mu.test(example),
  "The local environment example must leave the Sports credential blank.",
);

for (const path of files.filter((candidate) =>
  [".ts", ".tsx"].includes(extname(candidate)),
)) {
  const source = await readFile(path, "utf8");
  invariant(
    !source.includes("NEXT_PUBLIC_SPORTS_API_KEY"),
    `A public Sports credential name is forbidden: ${path}`,
  );
  if (/^["']use client["'];/mu.test(source)) {
    invariant(
      !source.includes("SPORTS_API_KEY"),
      `A client module references the Sports credential: ${path}`,
    );
  }
}

invariant(matrix, `Missing sanitized environment matrix: ${matrixPath}`);
invariant(matrix.includes("Status: `VERIFIED`"), "Environment matrix is not VERIFIED.");
const header = matrix
  .split(/\r?\n/u)
  .find((line) => line.startsWith("| Variable name |"));
invariant(header, "Environment matrix is missing its names/scopes header.");
invariant(!/\|\s*Value\s*\|/iu.test(header), "Environment matrix has a value column.");
const variableRows = matrix
  .split(/\r?\n/u)
  .filter((line) => /^\| `SPORTS_API_(?:KEY|PROVIDER)` \|/u.test(line));
invariant(variableRows.length === 8, `Expected eight scope rows, found ${variableRows.length}.`);
for (const environment of ["Production", "Preview", "Local", "CI"]) {
  for (const name of ["SPORTS_API_KEY", "SPORTS_API_PROVIDER"]) {
    invariant(
      variableRows.some((line) => line.startsWith(`| \`${name}\` | ${environment} |`)),
      `Environment matrix is missing ${name}/${environment}.`,
    );
  }
}
for (const expected of [
  "Production only",
  "Sensitive",
  "No Preview or branch-specific association",
  "Not present",
]) {
  invariant(matrix.includes(expected), `Environment matrix is missing: ${expected}`);
}
for (const stale of ["OWNER_ACTION_REQUIRED", "uncheck Preview", "Preview+Production"]) {
  invariant(
    !variableRows.some((line) => line.includes(stale)),
    `Environment matrix scope rows contain stale state: ${stale}`,
  );
}
invariant(
  !/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u.test(matrix),
  "Environment matrix resembles a JWT.",
);
invariant(
  !/(?:SUPABASE_SECRET_KEY|CRON_SECRET|SPORTS_API_KEY)\s*=\s*\S+/u.test(matrix),
  "Environment matrix contains a secret assignment.",
);

invariant(
  apiFootballClientTest.includes("clientWithTransport") &&
    apiFootballClientTest.includes("transport,"),
  "API-Football client tests must inject a fake transport.",
);
invariant(
  providerFactoryTest.includes("transport: async"),
  "Provider-factory tests must inject a fake transport.",
);
invariant(
  providerPoc.includes("new ManualSportsProvider"),
  "The Sports POC must remain on the Manual provider.",
);
invariant(
  syncE2e.includes("browserProviderRequests") &&
    syncE2e.includes("expect(browserProviderRequests).toEqual([])"),
  "The sync E2E must assert zero browser traffic to the live provider.",
);

console.log(
  "Sports secret boundaries verified: Production-only Sensitive scope is recorded without values; Preview/Local/CI remain keyless Manual paths and tests use fixtures/fake transports.",
);
