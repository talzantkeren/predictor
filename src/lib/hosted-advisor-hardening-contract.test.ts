import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const originalMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260825000000_revoke_rls_event_trigger_rpc_access.sql",
  ),
  "utf8",
);
const testableMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260828093000_slice9_hosted_rls_helper_hardening_contract.sql",
  ),
  "utf8",
);

const hardeningStatements = [
  "alter function public.rls_auto_enable() set search_path = ''",
  "revoke all privileges on function public.rls_auto_enable() from public, anon, authenticated, service_role",
];

describe("Hosted RLS helper hardening migration contract", () => {
  it("keeps the testable maintenance behavior identical to the original fix", () => {
    for (const statement of hardeningStatements) {
      expect(originalMigration).toContain(statement);
      expect(testableMigration).toContain(statement);
    }
  });

  it("runs the maintenance contract after revoking every Data API grant", () => {
    const revokeContractAt = testableMigration.indexOf(
      "revoke all on function private.slice9_harden_hosted_rls_auto_enable()",
    );
    const invokeContractAt = testableMigration.lastIndexOf(
      "select private.slice9_harden_hosted_rls_auto_enable();",
    );

    expect(revokeContractAt).toBeGreaterThan(-1);
    expect(invokeContractAt).toBeGreaterThan(revokeContractAt);
    expect(testableMigration.trimEnd()).toMatch(
      /select private\.slice9_harden_hosted_rls_auto_enable\(\);$/u,
    );
  });
});
