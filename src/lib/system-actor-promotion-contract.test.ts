import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260828100000_slice9_system_actor_legacy_promotion_contract.sql",
  ),
  "utf8",
).trim();

describe("legacy system-actor promotion migration", () => {
  it("keeps the deployment helper private, invoker-rights and fail-closed", () => {
    expect(migration).toContain(
      "create function private.slice9_promote_legacy_boundary_binding()",
    );
    expect(migration).toContain("language plpgsql\nset search_path = ''");
    expect(migration).not.toMatch(
      /slice9_promote_legacy_boundary_binding\(\)[\s\S]*security definer/iu,
    );
    expect(migration).toContain("message = 'SYSTEM_ACTOR_MISMATCH'");
    expect(migration).toContain(
      "from public, anon, authenticated, service_role;",
    );
  });

  it("auto-applies the promotion after revoking every Data API grant", () => {
    const revokePosition = migration.lastIndexOf(
      "revoke all on function private.slice9_promote_legacy_boundary_binding()",
    );
    const invocationPosition = migration.lastIndexOf(
      "select private.slice9_promote_legacy_boundary_binding();",
    );

    expect(revokePosition).toBeGreaterThan(-1);
    expect(invocationPosition).toBeGreaterThan(revokePosition);
    expect(migration).toMatch(
      /select private\.slice9_promote_legacy_boundary_binding\(\);$/u,
    );
  });
});
