import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const npmCliPath = process.env.npm_execpath;

if (!npmCliPath) {
  console.error("npm execution context is required to check database types.");
  process.exit(1);
}

const generated = spawnSync(
  process.execPath,
  [
    npmCliPath,
    "exec",
    "--",
    "supabase",
    "gen",
    "types",
    "typescript",
    "--local",
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  },
);

if (generated.status !== 0) {
  console.error("Could not generate database types from local Supabase.");
  process.exit(generated.status ?? 1);
}

const normalizeLineEndings = (value: string) => value.replaceAll("\r\n", "\n");
const current = readFileSync(
  resolve(process.cwd(), "src/types/database.generated.ts"),
  "utf8",
);

if (normalizeLineEndings(generated.stdout) !== normalizeLineEndings(current)) {
  console.error(
    "Generated database types are stale. Run `npm run types:db` and commit the result.",
  );
  process.exit(1);
}

console.log("Generated database types are current.");
