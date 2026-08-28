import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const scannerPath = resolve(
  repositoryRoot,
  "scripts/check-client-secret-absence.ts",
);
const tsxPath = resolve(repositoryRoot, "node_modules/tsx/dist/cli.mjs");
const temporaryDirectories: string[] = [];
const sentinel = `sports-client-sentinel-${"a".repeat(48)}`;

type FixtureOptions = {
  buildId?: string;
  contractBuildId?: string;
  contractSentinel?: string;
  omitContract?: boolean;
  staticContents?: string;
};

function createFixture(options: FixtureOptions = {}) {
  const directory = mkdtempSync(join(tmpdir(), "predictor-client-scan-"));
  temporaryDirectories.push(directory);
  const nextDirectory = join(directory, ".next");
  const staticDirectory = join(nextDirectory, "static");
  const serverAppDirectory = join(nextDirectory, "server", "app");
  mkdirSync(staticDirectory, { recursive: true });
  mkdirSync(serverAppDirectory, { recursive: true });

  const buildId = options.buildId ?? "fixture-build";
  writeFileSync(join(nextDirectory, "BUILD_ID"), `${buildId}\n`, "utf8");
  if (!options.omitContract) {
    writeFileSync(
      join(nextDirectory, "client-secret-scan-contract.json"),
      `${JSON.stringify({
        version: 1,
        buildId: options.contractBuildId ?? buildId,
        syntheticSentinel: options.contractSentinel ?? sentinel,
      })}\n`,
      "utf8",
    );
  }
  writeFileSync(
    join(staticDirectory, "fixture.js"),
    options.staticContents ?? "fixture client output",
    "utf8",
  );
  writeFileSync(
    join(serverAppDirectory, "fixture.html"),
    "<main>fixture rendered output</main>",
    "utf8",
  );
  return directory;
}

function runScanner(directory: string, environmentSentinel?: string) {
  const environment = { ...process.env };
  delete environment.CLIENT_SECRET_SENTINEL;
  if (environmentSentinel) {
    environment.CLIENT_SECRET_SENTINEL = environmentSentinel;
  }

  return spawnSync(process.execPath, [tsxPath, scannerPath], {
    cwd: directory,
    encoding: "utf8",
    env: environment,
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("direct client-secret artifact scan", () => {
  it("accepts a clean build whose contract matches its build ID", () => {
    const result = runScanner(createFixture());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("passed across 2 build artifacts");
  });

  it("fails when the synthetic server-only sentinel reaches a client artifact", () => {
    const result = runScanner(
      createFixture({ staticContents: `window.fixture = "${sentinel}";` }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("server-only sentinel was found");
    expect(result.stderr).not.toContain(sentinel);
  });

  it("fails closed when the contract belongs to another build", () => {
    const result = runScanner(
      createFixture({ contractBuildId: "stale-fixture-build" }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not belong to the current production build");
  });

  it("fails closed when the build contract is missing", () => {
    const result = runScanner(createFixture({ omitContract: true }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("requires the synthetic sentinel contract");
  });

  it("fails closed when an environment sentinel disagrees with the contract", () => {
    const otherSentinel = `sports-client-sentinel-${"b".repeat(48)}`;
    const result = runScanner(createFixture(), otherSentinel);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not match the current production build contract");
    expect(result.stderr).not.toContain(sentinel);
    expect(result.stderr).not.toContain(otherSentinel);
  });
});
