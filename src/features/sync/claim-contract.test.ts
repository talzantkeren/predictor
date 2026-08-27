import { describe, expect, it } from "vitest";

import { parseSportsSyncClaimRow } from "@/features/sync/claim-contract";

const forceCooldownRow = {
  result_outcome: "NOT_DUE",
  result_run_id: null,
  result_provider: "api-football",
  result_sync_kind: null,
  result_generation: null,
  result_token: null,
  result_locked_until: null,
  result_fixture_ids: [],
  result_code: "FORCE_COOLDOWN",
};

describe("sports sync claim row contract", () => {
  it("parses the real RPC FORCE_COOLDOWN row as a neutral no-run claim", () => {
    expect(parseSportsSyncClaimRow(forceCooldownRow)).toEqual({
      outcome: "NOT_DUE",
      runId: null,
      provider: "api-football",
      reason: "FORCE_COOLDOWN",
    });
  });

  it("rejects a cooldown row that claims to have persisted a run", () => {
    expect(
      parseSportsSyncClaimRow({
        ...forceCooldownRow,
        result_run_id: "71000000-0000-4000-8000-000000000007",
      }),
    ).toBeNull();
  });
});
