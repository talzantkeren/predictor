import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = process.cwd();
const fixturePath = join(
  repositoryRoot,
  "supabase",
  "tests",
  "keyset-pagination.test.sql",
);
const source = readFileSync(fixturePath, "utf8");
const planQueries = String.raw`
select * from finish();
select pg_temp.set_actor('d9920000-0000-4000-8000-0000000000c9');
\echo SCALE_PLAN dashboard_leagues_101
explain (analyze, buffers, format text)
select * from public.get_dashboard_leagues_page(null, null, 50);
\echo SCALE_PLAN eligible_leagues_101
explain (analyze, buffers, format text)
select * from public.get_match_eligible_leagues_page(
  'd9950000-0000-4000-8000-0000000000c9', null, null, 50
);
\echo SCALE_PLAN revealed_predictions_202
explain (analyze, buffers, format text)
select * from public.get_revealed_predictions_page(
  'd9930000-0000-4000-8000-000000000001',
  'd9950000-0000-4000-8000-0000000000c9', null, null, 50
);
\echo SCALE_PLAN active_members_201
explain (analyze, buffers, format text)
select * from public.get_active_league_members_page(
  'd9930000-0000-4000-8000-000000000001', null, null, 25
);
rollback;
`;
if (!/select \* from finish\(\);\s*rollback;\s*$/u.test(source)) {
  throw new Error("The representative pagination fixture no longer has the expected rollback boundary.");
}
const scaleSql = source
  .replace(
    /^begin;$/mu,
    "begin;\ncreate extension if not exists pgtap with schema extensions;\nset local search_path = public, extensions;",
  )
  .replace(/select \* from finish\(\);\s*rollback;\s*$/u, planQueries);

const dockerList = spawnSync(
  "docker",
  ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"],
  { encoding: "utf8" },
);
if (dockerList.status !== 0) {
  throw new Error(`Could not list local Supabase containers: ${dockerList.stderr.trim()}`);
}
const databaseContainers = dockerList.stdout
  .split(/\r?\n/u)
  .map((value) => value.trim())
  .filter((value) => value.startsWith("supabase_db_"));
if (databaseContainers.length !== 1) {
  throw new Error(`Expected one local Supabase database container, found ${databaseContainers.length}.`);
}

const psql = spawnSync(
  "docker",
  [
    "exec",
    "-i",
    databaseContainers[0],
    "psql",
    "--no-psqlrc",
    "--set",
    "ON_ERROR_STOP=1",
    "--username",
    "postgres",
    "--dbname",
    "postgres",
  ],
  { encoding: "utf8", input: scaleSql, maxBuffer: 32 * 1024 * 1024 },
);
const output = `${psql.stdout}\n${psql.stderr}`;
if (psql.status !== 0) {
  throw new Error(`Representative scale plan execution failed:\n${output.slice(-4_000)}`);
}
if (/not ok\b/iu.test(output)) {
  throw new Error("The representative fixture emitted a failing pgTAP assertion.");
}

const labels = [
  "dashboard_leagues_101",
  "eligible_leagues_101",
  "revealed_predictions_202",
  "active_members_201",
];
for (const label of labels) {
  if (!output.includes(`SCALE_PLAN ${label}`)) {
    throw new Error(`Missing representative plan: ${label}`);
  }
}
const executionTimes = [...output.matchAll(/Execution Time: ([\d.]+) ms/gu)].map(
  (match) => Number(match[1]),
);
if (executionTimes.length !== labels.length) {
  throw new Error(`Expected ${labels.length} execution times, found ${executionTimes.length}.`);
}
for (const duration of executionTimes) {
  if (!Number.isFinite(duration) || duration >= 500) {
    throw new Error(`Representative page execution exceeded the 500ms local guard: ${duration}ms.`);
  }
}
const returnedRows = [...output.matchAll(/Function Scan[^\n]*actual time=[^\n]*rows=(\d+)/gu)].map(
  (match) => Number(match[1]),
);
if (returnedRows.length !== labels.length || returnedRows.some((rows) => rows > 51)) {
  throw new Error(`Representative functions were not bounded to 51 rows: ${returnedRows.join(",")}`);
}

const outputDirectory = join(repositoryRoot, "tmp", "final-hardening");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "scale-plans.txt"), output, "utf8");
console.log(
  `Representative scale plans passed: ${labels.join(", ")}; execution=${executionTimes
    .map((duration) => `${duration.toFixed(3)}ms`)
    .join(", ")}; rows=${returnedRows.join(",")}.`,
);
