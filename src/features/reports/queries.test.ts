import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  getManagerReportSummary,
  mapBoundedExactCount,
  MAX_REPORT_ROWS,
} from "@/features/reports/queries";
import type { Database } from "@/types/database.generated";

type ReportTable = "leagues" | "league_members" | "join_requests";
type QueryCall = {
  table: ReportTable;
  columns?: string;
  options?: { count?: string; head?: boolean };
  filters: Array<[string, unknown]>;
};

function reportClient({
  managerId = "62000000-0000-4000-8000-000000000002",
  counts = {
    active: 2,
    pending_approval: 1,
    pending_proof: 1,
    rejected: 1,
  },
}: {
  managerId?: string;
  counts?: Record<string, number | null>;
} = {}) {
  const calls: QueryCall[] = [];
  const from = vi.fn((table: ReportTable) => {
    const call: QueryCall = { table, filters: [] };
    calls.push(call);

    const response = () => {
      if (table === "leagues") {
        return {
          data: {
            id: "62000000-0000-4000-8000-000000000001",
            name: "ליגת דוח",
            status: "active" as const,
            manager_id: managerId,
          },
          error: null,
        };
      }

      const status = call.filters.find(([column]) => column === "status")?.[1];
      return {
        count: counts[String(status)] ?? null,
        data: null,
        error: null,
      };
    };

    const builder = {
      select(columns: string, options?: { count?: string; head?: boolean }) {
        call.columns = columns;
        call.options = options;
        return builder;
      },
      eq(column: string, value: unknown) {
        call.filters.push([column, value]);
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(response());
      },
      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve(response()).then(onfulfilled, onrejected);
      },
    };

    return builder;
  });

  return {
    calls,
    client: { from } as unknown as SupabaseClient<Database>,
  };
}

describe("manager report exact-count mapping", () => {
  it.each([0, 1, 3, MAX_REPORT_ROWS])(
    "accepts a bounded exact count of %s",
    (count) => {
      expect(mapBoundedExactCount({ count, error: null })).toBe(count);
    },
  );

  it.each([
    null,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    MAX_REPORT_ROWS + 1,
  ])("fails closed for malformed or unbounded count %s", (count) => {
    expect(mapBoundedExactCount({ count, error: null })).toBeNull();
  });

  it("fails closed when the count query returns an error", () => {
    expect(
      mapBoundedExactCount({ count: 2, error: { message: "private detail" } }),
    ).toBeNull();
  });
});

describe("manager report query contract", () => {
  const leagueId = "62000000-0000-4000-8000-000000000001";
  const managerId = "62000000-0000-4000-8000-000000000002";

  it("counts active memberships once and keeps request states separate", async () => {
    const { calls, client } = reportClient();

    await expect(
      getManagerReportSummary(client, leagueId, managerId),
    ).resolves.toMatchObject({
      status: "found",
      membership: {
        activeMembers: 2,
        pendingApproval: 1,
        pendingProof: 1,
        rejected: 1,
      },
    });

    const membershipCall = calls.find(
      (call) => call.table === "league_members",
    );
    expect(membershipCall).toMatchObject({
      columns: "id",
      options: { count: "exact", head: true },
      filters: [
        ["league_id", leagueId],
        ["status", "active"],
      ],
    });
    expect(
      calls
        .filter((call) => call.table === "join_requests")
        .map((call) => call.filters.at(-1)),
    ).toEqual([
      ["status", "pending_approval"],
      ["status", "pending_proof"],
      ["status", "rejected"],
    ]);
  });

  it("excludes removed memberships and cannot multiply requests by proof history", async () => {
    const { calls, client } = reportClient();
    await getManagerReportSummary(client, leagueId, managerId);

    expect(calls.some((call) => call.table === "league_members")).toBe(true);
    expect(
      calls.some((call) =>
        call.filters.some(
          ([column, value]) => column === "status" && value === "removed",
        ),
      ),
    ).toBe(false);
    expect(calls.map((call) => call.table)).not.toContain("payment_proofs");
  });

  it("denies an ordinary member or another manager before report counts", async () => {
    const { calls, client } = reportClient({
      managerId: "62000000-0000-4000-8000-000000000009",
    });

    await expect(
      getManagerReportSummary(client, leagueId, managerId),
    ).resolves.toEqual({ status: "not-found" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe("leagues");
  });

  it("fails closed when a report count exceeds the configured cap", async () => {
    const { client } = reportClient({
      counts: {
        active: MAX_REPORT_ROWS + 1,
        pending_approval: 0,
        pending_proof: 0,
        rejected: 0,
      },
    });

    await expect(
      getManagerReportSummary(client, leagueId, managerId),
    ).resolves.toEqual({ status: "error" });
  });
});
