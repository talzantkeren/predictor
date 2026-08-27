import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { getDashboardLeagues } from "@/features/leagues/queries";
import { getMyJoinRequests } from "@/features/membership/queries";
import { getMatchDetail } from "@/features/predictions/queries";
import { getSystemMatchList } from "@/features/scoring/queries";
import { decodeKeysetCursor } from "@/lib/keyset-pagination";
import type { Database } from "@/types/database.generated";

const timestamp = "2026-08-27T12:00:00.000Z";

function fixtureUuid(group: string, ordinal: number) {
  return `a1000000-${group}-4000-8000-${ordinal.toString().padStart(12, "0")}`;
}

describe("actor-derived keyset query contracts", () => {
  it("requests a bounded dashboard sentinel and derives the next cursor", async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      league_id: fixtureUuid("0100", index + 1),
      league_name: `League ${index + 1}`,
      league_status: "open" as const,
      league_created_at: timestamp,
      season_name: "2026/27",
      viewer_role: index === 0 ? ("manager" as const) : ("member" as const),
    }));
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    const result = await getDashboardLeagues(client, {
      at: timestamp,
      id: fixtureUuid("0100", 99),
    });

    expect(rpc).toHaveBeenCalledWith("get_dashboard_leagues_page", {
      p_cursor_created_at: timestamp,
      p_cursor_league_id: fixtureUuid("0100", 99),
      p_page_size: 20,
    });
    expect(result.ok).toBe(true);
    expect(result.data.items).toHaveLength(20);
    expect(result.data.hasMore).toBe(true);
    if (result.data.hasMore) {
      expect(decodeKeysetCursor(result.data.nextCursor)).toEqual({
        at: timestamp,
        id: fixtureUuid("0100", 20),
      });
    }
  });

  it("uses only the session-derived own-request RPC and keeps its bound", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(getMyJoinRequests(client)).resolves.toEqual({
      ok: true,
      data: { items: [], hasMore: false, nextCursor: null },
    });
    expect(rpc).toHaveBeenCalledWith("get_my_join_requests_page", {
      p_page_size: 25,
    });
  });

  it("authorizes an explicitly selected league even when it is outside the selector page", async () => {
    const matchId = fixtureUuid("0200", 1);
    const requestedLeagueId = fixtureUuid("0300", 99);
    const eligibleRows = Array.from({ length: 21 }, (_, index) => ({
      league_id: fixtureUuid("0300", index + 1),
      league_name: `Eligible ${index + 1}`,
      league_status: "open" as const,
      league_created_at: timestamp,
    }));
    const detailRow = {
      league_id: requestedLeagueId,
      league_name: "Exact selected league",
      league_status: "open" as const,
      match_id: matchId,
      round_number: 1,
      kickoff_at: "2099-01-01T12:00:00.000Z",
      predictions_locked_at: null,
      match_status: "scheduled" as const,
      provider_status: null,
      home_score: null,
      away_score: null,
      home_team_id: fixtureUuid("0400", 1),
      home_team_name: "Home",
      home_team_short_name: null,
      away_team_id: fixtureUuid("0400", 2),
      away_team_name: "Away",
      away_team_short_name: null,
      database_time: timestamp,
      own_prediction_id: null,
      own_predicted_home_score: null,
      own_predicted_away_score: null,
      own_predicted_outcome: null,
      own_prediction_created_at: null,
      own_prediction_updated_at: null,
    };
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "get_match_eligible_leagues_page") {
        return { data: eligibleRows, error: null };
      }
      if (name === "get_match_detail_context") {
        expect(args.p_league_id).toBe(requestedLeagueId);
        return { data: [detailRow], error: null };
      }
      if (name === "get_revealed_predictions_page") {
        return { data: [], error: null };
      }
      throw new Error("Unexpected pagination RPC.");
    });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    const result = await getMatchDetail(
      client,
      matchId,
      fixtureUuid("0500", 1),
      { requestedLeagueId },
    );

    expect(result).toMatchObject({
      status: "found",
      data: {
        league: { id: requestedLeagueId },
        eligibleLeagues: { hasMore: true },
      },
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "get_match_eligible_leagues_page", {
      p_match_id: matchId,
      p_page_size: 20,
    });
  });

  it("keeps the system match list bounded and applies every filter before its cursor", async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const rows = Array.from({ length: 26 }, (_, index) => ({
      id: fixtureUuid("0600", index + 1),
      season_id: fixtureUuid("0700", 1),
      round_number: 7,
      home_team_id: fixtureUuid("0800", 1),
      away_team_id: fixtureUuid("0800", 2),
      kickoff_at: timestamp,
      status: "scheduled" as const,
      home_score: null,
      away_score: null,
      result_version: 0,
      is_manually_overridden: false,
      external_provider: null,
      home_team: { name: "Home" },
      away_team: { name: "Away" },
    }));
    const response = { data: rows, error: null };
    const builder = {
      select(columns: string) {
        calls.push(["select", columns]);
        return builder;
      },
      order(column: string, options: unknown) {
        calls.push(["order", column, options]);
        return builder;
      },
      limit(value: number) {
        calls.push(["limit", value]);
        return builder;
      },
      eq(column: string, value: unknown) {
        calls.push(["eq", column, value]);
        return builder;
      },
      or(value: string) {
        calls.push(["or", value]);
        return builder;
      },
      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: typeof response) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve(response).then(onfulfilled, onrejected);
      },
    };
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const from = vi.fn().mockReturnValue(builder);
    const client = { from, rpc } as unknown as SupabaseClient<Database>;
    const cursorId = fixtureUuid("0600", 99);

    const result = await getSystemMatchList(
      client,
      {
        seasonId: fixtureUuid("0700", 1),
        status: "scheduled",
        roundNumber: 7,
      },
      { at: timestamp, id: cursorId },
    );

    expect(rpc).toHaveBeenCalledWith("is_system_admin");
    expect(from).toHaveBeenCalledWith("matches");
    expect(calls).toContainEqual(["limit", 26]);
    expect(calls).toContainEqual(["eq", "season_id", fixtureUuid("0700", 1)]);
    expect(calls).toContainEqual(["eq", "status", "scheduled"]);
    expect(calls).toContainEqual(["eq", "round_number", 7]);
    expect(calls).toContainEqual([
      "or",
      `kickoff_at.lt.${timestamp},and(kickoff_at.eq.${timestamp},id.lt.${cursorId})`,
    ]);
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.matches.items).toHaveLength(25);
      expect(result.matches.hasMore).toBe(true);
    }
  });
});
