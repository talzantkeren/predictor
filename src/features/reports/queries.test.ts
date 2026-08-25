import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  getManagerReportSummary,
  mapExactCount,
} from "@/features/reports/queries";
import type { Database } from "@/types/database.generated";

const reportLeagueId = "62000000-0000-4000-8000-000000000001";
const reportManagerId = "62000000-0000-4000-8000-000000000002";

type ReportTable = "leagues" | "league_members" | "join_requests";
type QueryCall = {
  table: ReportTable;
  columns?: string;
  options?: { count?: string; head?: boolean };
  filters: Array<[string, unknown]>;
};

function reportClient({
  managerId = reportManagerId,
  leagueData,
  leagueError = null,
  counts = {
    active: 2,
    pending_approval: 1,
    pending_proof: 1,
    rejected: 1,
  },
}: {
  managerId?: string;
  leagueData?: {
    id: string;
    name: string;
    status: "active";
    manager_id: string;
  } | null;
  leagueError?: unknown;
  counts?: Record<string, number | null>;
} = {}) {
  const calls: QueryCall[] = [];
  const resolvedLeague =
    leagueData === undefined
      ? {
          id: reportLeagueId,
          name: "ליגת דוח",
          status: "active" as const,
          manager_id: managerId,
        }
      : leagueData;
  const from = vi.fn((table: ReportTable) => {
    const call: QueryCall = { table, filters: [] };
    calls.push(call);

    const response = () => {
      if (table === "leagues") {
        const requestedLeagueId = call.filters.find(
          ([column]) => column === "id",
        )?.[1];
        return {
          data: requestedLeagueId === reportLeagueId ? resolvedLeague : null,
          error: leagueError,
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
  it.each([0, 1, 3, 500, 501, Number.MAX_SAFE_INTEGER])(
    "accepts a valid exact count of %s",
    (count) => {
      expect(mapExactCount({ count, error: null })).toBe(count);
    },
  );

  it.each([
    null,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("fails closed for malformed count %s", (count) => {
    expect(mapExactCount({ count, error: null })).toBeNull();
  });

  it("fails closed when the count query returns an error", () => {
    expect(
      mapExactCount({ count: 2, error: { message: "private detail" } }),
    ).toBeNull();
  });
});

describe("manager report query contract", () => {
  const leagueId = reportLeagueId;
  const managerId = reportManagerId;

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

    expect(calls[0]).toMatchObject({
      table: "leagues",
      columns: "id, name, status, manager_id",
      filters: [["id", leagueId]],
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

  it("returns not-found when RLS hides the requested league", async () => {
    const { calls, client } = reportClient({ leagueData: null });

    await expect(
      getManagerReportSummary(client, leagueId, managerId),
    ).resolves.toEqual({ status: "not-found" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.filters).toEqual([["id", leagueId]]);
  });

  it("fails closed when the league lookup fails", async () => {
    const { calls, client } = reportClient({
      leagueError: { message: "private database detail" },
    });

    await expect(
      getManagerReportSummary(client, leagueId, managerId),
    ).resolves.toEqual({ status: "error" });
    expect(calls).toHaveLength(1);
  });

  it("keeps a large valid historical request count available", async () => {
    const { client } = reportClient({
      counts: {
        active: 2,
        pending_approval: 0,
        pending_proof: 0,
        rejected: 501,
      },
    });

    await expect(
      getManagerReportSummary(client, leagueId, managerId),
    ).resolves.toMatchObject({
      status: "found",
      membership: { activeMembers: 2, rejected: 501 },
    });
  });
});
