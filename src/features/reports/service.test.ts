import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  getManagerLeagueReport,
  getReportStandingsKind,
} from "@/features/reports/service";
import type { LeagueStandings } from "@/features/scoring/types";
import type { Database } from "@/types/database.generated";

const leagueId = "62000000-0000-4000-8000-000000000001";
const managerId = "62000000-0000-4000-8000-000000000002";
const client = {} as SupabaseClient<Database>;

function standing(
  userId: string,
  displayName: string,
  rank: number,
) {
  return {
    leagueId,
    userId,
    displayName,
    totalPoints: rank === 3 ? 0 : 3,
    correctOutcomes: rank === 3 ? 0 : 1,
    exactScores: 1,
    predictionsSubmitted: 1,
    rank,
  };
}

function dependencies({
  status = "active" as const,
  activeMembers = 1,
  standings = [standing(managerId, "מנהלת", 1)],
}: {
  status?: Database["public"]["Enums"]["league_status"];
  activeMembers?: number;
  standings?: LeagueStandings["standings"];
} = {}) {
  return {
    getSummary: vi.fn().mockResolvedValue({
      status: "found",
      league: { id: leagueId, name: "ליגת דוח", status },
      membership: {
        activeMembers,
        pendingApproval: 1,
        pendingProof: 2,
        rejected: 3,
      },
    }),
    getStandings: vi.fn().mockResolvedValue({
      status: "found",
      data: {
        league: { id: leagueId, name: "ליגת דוח" },
        viewerIsManager: true,
        standings,
      },
    }),
  };
}

describe("manager report service", () => {
  it("reports a creator-only league as one active member", async () => {
    const result = await getManagerLeagueReport(
      client,
      leagueId,
      managerId,
      dependencies(),
    );

    expect(result).toMatchObject({
      status: "found",
      data: {
        membership: { activeMembers: 1 },
        standings: [{ userId: managerId }],
      },
    });
  });

  it("preserves a valid zero-member, empty-leaderboard report", async () => {
    const result = await getManagerLeagueReport(
      client,
      leagueId,
      managerId,
      dependencies({ activeMembers: 0, standings: [] }),
    );

    expect(result).toMatchObject({
      status: "found",
      data: { membership: { activeMembers: 0 }, standings: [] },
    });
  });

  it("preserves separate request statuses without consulting proof rows", async () => {
    const deps = dependencies({ activeMembers: 2 });
    const result = await getManagerLeagueReport(
      client,
      leagueId,
      managerId,
      deps,
    );

    expect(result).toMatchObject({
      status: "found",
      data: {
        membership: {
          activeMembers: 2,
          pendingApproval: 1,
          pendingProof: 2,
          rejected: 3,
        },
      },
    });
    expect(deps.getSummary).toHaveBeenCalledTimes(1);
  });

  it("reuses competition ranks and keys duplicate names by user ID", async () => {
    const rows = [
      standing(managerId, "שם זהה", 1),
      standing("62000000-0000-4000-8000-000000000003", "שם זהה", 1),
      standing("62000000-0000-4000-8000-000000000004", "משתתף", 3),
    ];
    const result = await getManagerLeagueReport(
      client,
      leagueId,
      managerId,
      dependencies({ activeMembers: 3, standings: rows }),
    );

    expect(result).toMatchObject({
      status: "found",
      data: { standings: [{ rank: 1 }, { rank: 1 }, { rank: 3 }] },
    });
    if (result.status === "found") {
      expect(new Set(result.data.standings.map((row) => row.userId)).size).toBe(
        3,
      );
    }
  });

  it("does not read standings before manager authorization succeeds", async () => {
    const deps = dependencies();
    deps.getSummary.mockResolvedValueOnce({ status: "not-found" });

    await expect(
      getManagerLeagueReport(client, leagueId, managerId, deps),
    ).resolves.toEqual({ status: "not-found" });
    expect(deps.getStandings).not.toHaveBeenCalled();
  });

  it("fails closed when the shared standings query exceeds its limit", async () => {
    const deps = dependencies();
    deps.getStandings.mockResolvedValueOnce({ status: "error" });

    await expect(
      getManagerLeagueReport(client, leagueId, managerId, deps),
    ).resolves.toEqual({ status: "error" });
  });

  it("uses final wording only for an actually completed league", () => {
    expect(getReportStandingsKind("active")).toBe("current");
    expect(getReportStandingsKind("completed")).toBe("final");
    expect(getReportStandingsKind("archived")).toBe("current");
  });
});
