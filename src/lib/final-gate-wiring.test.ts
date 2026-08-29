import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { scripts?: Record<string, unknown> };
const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);

const staticGates = [
  "submission:evidence:check",
  "hardening:check",
  "owner-runbooks:check",
  "sports:secret-boundaries",
] as const;
const databaseGate = "scale:plans";
const directArtifactGate = "test:client-secrets:scan";
const allGates = [...staticGates, databaseGate, directArtifactGate];

function jobSource(name: string, nextName?: string) {
  const start = workflow.indexOf(`  ${name}:`);
  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start) : workflow.length;
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

function expectOrdered(commands: string[], first: string, second: string) {
  expect(commands.indexOf(first)).toBeGreaterThan(-1);
  expect(commands.indexOf(second)).toBeGreaterThan(commands.indexOf(first));
}

describe("final gate enforcement", () => {
  it("runs every named gate directly from npm run verify in dependency order", () => {
    const verify = packageJson.scripts?.verify;
    expect(typeof verify).toBe("string");
    const commands = (verify as string).split(" && ");

    for (const gate of allGates) {
      expect(commands).toContain(`npm run ${gate}`);
    }
    expectOrdered(commands, "npm run test", "npm run submission:evidence:check");
    expectOrdered(commands, "npm run sports:secret-boundaries", "npm run test:db");
    expectOrdered(commands, "npm run test:db", "npm run scale:plans");
    expectOrdered(
      commands,
      "npm run test:client-secrets",
      "npm run test:client-secrets:scan",
    );
    expectOrdered(
      commands,
      "npm run test:client-secrets:scan",
      "npm run test:e2e:run",
    );
  });

  it("places static, database, and artifact gates in CI jobs that can run them", () => {
    const quality = jobSource("quality", "database");
    const database = jobSource("database", "e2e");
    const e2e = jobSource("e2e");

    for (const gate of staticGates) {
      expect(quality).toContain(`run: npm run ${gate}`);
      expect(database).not.toContain(`run: npm run ${gate}`);
      expect(e2e).not.toContain(`run: npm run ${gate}`);
    }
    expect(database).toContain(`run: npm run ${databaseGate}`);
    expect(database.indexOf("run: npm run test:db")).toBeLessThan(
      database.indexOf(`run: npm run ${databaseGate}`),
    );
    expect(database.indexOf(`run: npm run ${databaseGate}`)).toBeLessThan(
      database.indexOf("run: npm exec -- supabase stop"),
    );
    expect(e2e).toContain(`run: npm run ${directArtifactGate}`);
    expect(e2e.indexOf("run: npm run test:client-secrets")).toBeLessThan(
      e2e.indexOf(`run: npm run ${directArtifactGate}`),
    );
    expect(e2e.indexOf(`run: npm run ${directArtifactGate}`)).toBeLessThan(
      e2e.indexOf("run: npm run test:e2e:run"),
    );
  });

  it("persists a build-bound synthetic sentinel for the direct scan", () => {
    const scanner = readFileSync(
      resolve(process.cwd(), "scripts/check-client-secret-absence.ts"),
      "utf8",
    );
    const runner = readFileSync(
      resolve(process.cwd(), "scripts/run-e2e.ts"),
      "utf8",
    );

    for (const expected of [
      'join(nextDirectory, "BUILD_ID")',
      'join(nextDirectory, "client-secret-scan-contract.json")',
      "contract.buildId !== buildId",
      "contract.syntheticSentinel",
      "sports-client-sentinel-[a-f0-9]{48}",
    ]) {
      expect(scanner).toContain(expected);
    }
    expect(runner).toContain("CLIENT_SECRET_SENTINEL: clientSecretSentinel");
    expect(runner).toContain('run(["run", "test:client-secrets:scan"]');
  });
});
