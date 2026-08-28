import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const checker = readFileSync(
  resolve(process.cwd(), "scripts/check-slice9-owner-runbooks.mjs"),
  "utf8",
);
const runbook = readFileSync(
  resolve(
    process.cwd(),
    "docs/runbooks/slice-9-req-003-final-production-review.md",
  ),
  "utf8",
);
const template = readFileSync(
  resolve(
    process.cwd(),
    "docs/evidence/slice-9/w8/S9-REQ-003-owner-template.md",
  ),
  "utf8",
);

const section = "3A. Require the system actor designation before application traffic";
const observations = [
  "exactly_one_designated_actor",
  "boundary_binding_ready",
  "sync_actor_matches_designation",
] as const;

describe("system-actor owner runbook contract", () => {
  it("makes the complete pre-traffic gate mandatory in the executable checker", () => {
    expect(checker).toContain(section);
    for (const observation of observations) {
      expect(checker.split(`"${observation}"`)).toHaveLength(3);
    }
  });

  it("orders the pre-traffic gate after migrations and before deployment", () => {
    const migrationParity = runbook.indexOf("## 3. Prove Hosted migration parity");
    const systemActorGate = runbook.indexOf(`### ${section}`);
    const productionDeployment = runbook.indexOf(
      "## 5. Bind the live Production deployment to the final SHA",
    );

    expect(migrationParity).toBeGreaterThan(-1);
    expect(systemActorGate).toBeGreaterThan(migrationParity);
    expect(productionDeployment).toBeGreaterThan(systemActorGate);
    for (const observation of observations) {
      expect(runbook).toContain(observation);
    }
  });

  it("provides value-free evidence fields for every required observation", () => {
    const readiness = template.slice(
      template.indexOf("## System actor readiness"),
      template.indexOf("## Environment scopes"),
    );

    expect(readiness).toContain("## System actor readiness");
    for (const observation of observations) {
      expect(readiness).toContain(`${observation}: NOT_RUN`);
    }
    expect(readiness).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu,
    );
  });
});
