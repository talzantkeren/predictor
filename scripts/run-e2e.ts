import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

type LocalSupabaseStatus = {
  API_URL?: unknown;
  PUBLISHABLE_KEY?: unknown;
};

const npmCliPath = process.env.npm_execpath;
const npmCommand = npmCliPath
  ? process.execPath
  : process.platform === "win32"
    ? "npm.cmd"
    : "npm";
const npmArgumentPrefix = npmCliPath ? [npmCliPath] : [];
const npmNeedsShell = !npmCliPath && process.platform === "win32";
const skipBuild = process.argv.includes("--skip-build");
const serveOnly = process.argv.includes("--serve-only");
const externalSmoke = process.argv.includes("--external-smoke");
const playwrightArguments = process.argv
  .slice(2)
  .filter(
    (argument) =>
      argument !== "--skip-build" &&
      argument !== "--serve-only" &&
      argument !== "--external-smoke",
  );
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

if (externalBaseUrl && !externalSmoke) {
  console.error(
    "External E2E requires the explicit preview smoke command: npm run test:e2e:preview.",
  );
  process.exit(1);
}

if (externalSmoke && !externalBaseUrl) {
  console.error("PLAYWRIGHT_BASE_URL is required for the preview smoke suite.");
  process.exit(1);
}

function getProcessEnvironment() {
  const environment = { ...process.env };

  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const dockerDirectory = join(
      process.env.LOCALAPPDATA,
      "Programs",
      "DockerDesktop",
      "resources",
      "bin",
    );

    if (existsSync(dockerDirectory)) {
      environment.Path = `${dockerDirectory}${delimiter}${environment.Path ?? ""}`;
    }
  }

  return environment;
}

const processEnvironment = getProcessEnvironment();

function run(args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(npmCommand, [...npmArgumentPrefix, ...args], {
    cwd: process.cwd(),
    env,
    shell: npmNeedsShell,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getLocalSupabaseEnvironment() {
  const result = spawnSync(
    npmCommand,
    [...npmArgumentPrefix, "exec", "--", "supabase", "status", "-o", "json"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: processEnvironment,
      shell: npmNeedsShell,
    },
  );

  if (result.status !== 0) {
    console.error(
      "Local Supabase is not running. Start it before running the authentication E2E suite.",
    );
    process.exit(result.status ?? 1);
  }

  let status: LocalSupabaseStatus;

  try {
    const jsonStart = result.stdout.indexOf("{");

    if (jsonStart < 0) {
      throw new Error("Missing JSON status");
    }

    status = JSON.parse(result.stdout.slice(jsonStart)) as LocalSupabaseStatus;
  } catch {
    console.error("Could not read the local Supabase status response.");
    process.exit(1);
  }

  if (
    typeof status.API_URL !== "string" ||
    typeof status.PUBLISHABLE_KEY !== "string"
  ) {
    console.error("Local Supabase did not provide the required public values.");
    process.exit(1);
  }

  return {
    ...processEnvironment,
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    SPORTS_API_PROVIDER: "manual",
    DEMO_MODE: "true",
  };
}

const environment = externalBaseUrl
  ? processEnvironment
  : getLocalSupabaseEnvironment();

if (!skipBuild && !externalBaseUrl) {
  run(["run", "build"], environment);
}

if (serveOnly && !externalBaseUrl) {
  run(["run", "start", "--", "--hostname", "localhost"], environment);
  process.exit(0);
}

run(
  [
    "exec",
    "--",
    "playwright",
    "test",
    ...(externalSmoke ? ["--grep", "@preview"] : []),
    ...playwrightArguments,
  ],
  environment,
);
