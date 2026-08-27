import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

import { containsUnexpectedWebServerError } from "@/lib/playwright-server-log";

type LocalSupabaseStatus = {
  API_URL?: unknown;
  PUBLISHABLE_KEY?: unknown;
  SECRET_KEY?: unknown;
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
const clientSecretCheckOnly = process.argv.includes(
  "--client-secret-check-only",
);
const playwrightArguments = process.argv
  .slice(2)
  .filter(
    (argument) =>
      argument !== "--skip-build" &&
      argument !== "--serve-only" &&
      argument !== "--external-smoke" &&
      argument !== "--client-secret-check-only",
  );
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

if (
  clientSecretCheckOnly &&
  (skipBuild || serveOnly || externalSmoke || externalBaseUrl)
) {
  console.error(
    "The client-secret gate is a local build check and cannot be combined with E2E mode flags.",
  );
  process.exit(1);
}

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
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    // Playwright otherwise writes an automatic DOM/URL error snapshot. Slice
    // 3 exercises bearer-token URLs, so failure artifacts must omit page state.
    PLAYWRIGHT_NO_COPY_PROMPT: "1",
  };

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

function run(
  args: string[],
  env: NodeJS.ProcessEnv,
  options: { rejectWebServerErrors?: boolean } = {},
) {
  const result = spawnSync(npmCommand, [...npmArgumentPrefix, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    maxBuffer: 16 * 1024 * 1024,
    shell: npmNeedsShell,
    stdio: options.rejectWebServerErrors
      ? ["inherit", "pipe", "pipe"]
      : "inherit",
  });

  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";

  if (options.rejectWebServerErrors) {
    process.stdout.write(stdout);
    process.stderr.write(stderr);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (
    options.rejectWebServerErrors &&
    containsUnexpectedWebServerError(`${stdout}\n${stderr}`)
  ) {
    console.error(
      "Playwright emitted an unexpected local web-server error; the passing test count is not sufficient evidence.",
    );
    process.exit(1);
  }
}

async function runPlaywright(
  args: string[],
  env: NodeJS.ProcessEnv,
  options: { rejectWebServerErrors: boolean },
) {
  const child = spawn(npmCommand, [...npmArgumentPrefix, ...args], {
    cwd: process.cwd(),
    env,
    shell: npmNeedsShell,
    stdio: ["inherit", "pipe", "pipe"],
  });
  const output: string[] = [];

  child.stdout.on("data", (chunk: Buffer) => {
    const value = chunk.toString("utf8");
    output.push(value);
    process.stdout.write(value);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    const value = chunk.toString("utf8");
    output.push(value);
    process.stderr.write(value);
  });

  const status = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });

  if (status !== 0) {
    process.exit(status);
  }

  if (
    options.rejectWebServerErrors &&
    containsUnexpectedWebServerError(output.join(""))
  ) {
    console.error(
      "Playwright emitted an unexpected local web-server error; the passing test count is not sufficient evidence.",
    );
    process.exit(1);
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
    typeof status.PUBLISHABLE_KEY !== "string" ||
    typeof status.SECRET_KEY !== "string"
  ) {
    console.error("Local Supabase did not provide the required runtime values.");
    process.exit(1);
  }

  return {
    ...processEnvironment,
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: status.SECRET_KEY,
    CRON_SECRET: randomBytes(32).toString("base64url"),
    SYNC_SYSTEM_ACTOR_ID: "70000000-0000-4000-8000-000000000007",
    SPORTS_API_PROVIDER: "manual",
    DEMO_MODE: "true",
  };
}

const environment = externalBaseUrl
  ? processEnvironment
  : getLocalSupabaseEnvironment();

if (!skipBuild && !externalBaseUrl) {
  const clientSecretSentinel = `sports-client-sentinel-${randomBytes(24).toString("hex")}`;
  const sentinelBuildEnvironment = {
    ...environment,
    SPORTS_API_PROVIDER: "api-football",
    SPORTS_API_KEY: clientSecretSentinel,
    CLIENT_SECRET_SENTINEL: clientSecretSentinel,
  };
  run(["run", "build"], sentinelBuildEnvironment);
  run(["run", "test:client-secrets:scan"], sentinelBuildEnvironment);
}

if (clientSecretCheckOnly) {
  process.exit(0);
}

if (serveOnly && !externalBaseUrl) {
  run(["run", "start", "--", "--hostname", "localhost"], environment);
  process.exit(0);
}

void runPlaywright(
  [
    "exec",
    "--",
    "playwright",
    "test",
    ...(externalSmoke ? ["--grep", "@preview"] : []),
    ...playwrightArguments,
  ],
  environment,
  { rejectWebServerErrors: !externalBaseUrl },
).catch(() => {
  console.error("Playwright could not be started.");
  process.exit(1);
});
