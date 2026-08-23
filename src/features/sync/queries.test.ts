import { describe, expect, it } from "vitest";

import { mapSyncRun } from "@/features/sync/queries";

describe("sync run query mapping", () => {
  const validRow = {
    id: "71000000-0000-4000-8000-000000000007",
    provider: "manual",
    status: "skipped" as const,
    sync_kind: "manual",
    started_at: "2026-08-22T10:00:00.000Z",
    finished_at: "2026-08-22T10:00:00.000Z",
    lease_generation: null,
    locked_until: null,
    fixtures_seen: 0,
    rows_inserted: 0,
    teams_changed: 0,
    matches_changed: 0,
    results_changed: 0,
    manual_overrides_skipped: 0,
    quota_remaining: null,
    operator_notes: [],
    error_code: "MANUAL_PROVIDER",
    error_message_safe: null,
  };

  it("retains a skipped outcome code without classifying the row as failed", () => {
    expect(mapSyncRun(validRow)).toEqual({
      id: validRow.id,
      provider: "manual",
      status: "skipped",
      startedAt: validRow.started_at,
      finishedAt: validRow.finished_at,
      fixturesSeen: 0,
      syncKind: "manual",
      rowsInserted: 0,
      teamsChanged: 0,
      matchesChanged: 0,
      resultsChanged: 0,
      manualOverridesSkipped: 0,
      quotaRemaining: null,
      operatorNotes: [],
      resultCode: "MANUAL_PROVIDER",
      errorMessageSafe: null,
    });
  });

  it.each([
    { started_at: "not-a-date" },
    { finished_at: "not-a-date" },
    { fixtures_seen: -1 },
    { matches_changed: 1.5 },
  ])("rejects malformed operational data: %o", (change) => {
    expect(mapSyncRun({ ...validRow, ...change })).toBeNull();
  });
});
