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

const [workflow, example, matrix, files] = await Promise.all([
  readFile(workflowPath, "utf8"),
  readFile(examplePath, "utf8"),
  readFile(matrixPath, "utf8").catch(() => undefined),
  sourceFiles("src"),
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
for (const environment of ["Production", "Preview", "Local", "CI"]) {
  const row = matrix
    .split(/\r?\n/u)
    .find((line) => line.startsWith(`| ${environment} |`));
  invariant(row, `Environment matrix is missing: ${environment}`);
  const cells = row.split("|").map((cell) => cell.trim());
  invariant(
    cells.at(-2) === "",
    `The ${environment} value cell must remain blank.`,
  );
}
for (const expected of [
  "Preview",
  "Local",
  "CI",
  "OWNER_ACTION_REQUIRED",
  "uncheck Preview",
]) {
  invariant(matrix.includes(expected), `Environment matrix is missing: ${expected}`);
}
invariant(
  !/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u.test(matrix),
  "Environment matrix resembles a JWT.",
);
invariant(
  !/(?:SUPABASE_SECRET_KEY|CRON_SECRET|SPORTS_API_KEY)\s*=\s*\S+/u.test(matrix),
  "Environment matrix contains a secret assignment.",
);

console.log(
  "Sports secret boundaries verified: CI/Local are Manual, client modules have no credential path, and four matrix values are blank.",
);

