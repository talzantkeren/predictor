import { describe, expect, it } from "vitest";

import {
  buildManualCatalogPayload,
  manualCompetition,
  manualFixtures,
  ManualSportsProvider,
} from "@/features/sports";

const provider = new ManualSportsProvider({
  competition: manualCompetition,
  fixtures: manualFixtures,
});

describe("manual-catalog-v1", () => {
  it("builds the exact bounded adapter payload used by the database import", async () => {
    const snapshot = await provider.getSyncSnapshot({ kind: "catalog" });

    expect(buildManualCatalogPayload(snapshot)).toEqual({
      catalogId: "manual-catalog-v1",
      competitionId: "26000000-0000-4000-8000-000000000001",
      seasonId: "26000000-0000-4000-8000-000000000027",
      teams: [
        {
          id: "26000000-0000-4000-8000-000000000101",
          name: "הפועל תל אביב",
          shortName: "הפועל תל אביב",
        },
        {
          id: "26000000-0000-4000-8000-000000000102",
          name: "מכבי תל אביב",
          shortName: "מכבי תל אביב",
        },
        {
          id: "26000000-0000-4000-8000-000000000103",
          name: "בית״ר ירושלים",
          shortName: "בית״ר",
        },
        {
          id: "26000000-0000-4000-8000-000000000104",
          name: "הפועל חיפה",
          shortName: "הפועל חיפה",
        },
        {
          id: "26000000-0000-4000-8000-000000000105",
          name: "מ.ס. אשדוד",
          shortName: "אשדוד",
        },
        {
          id: "26000000-0000-4000-8000-000000000106",
          name: "הפועל באר שבע",
          shortName: "באר שבע",
        },
      ],
      matches: [
        {
          id: "26000000-0000-4000-8000-000000000201",
          seasonId: "26000000-0000-4000-8000-000000000027",
          roundNumber: 1,
          homeTeamId: "26000000-0000-4000-8000-000000000101",
          awayTeamId: "26000000-0000-4000-8000-000000000102",
          kickoffAt: "2026-10-17T16:00:00.000Z",
          status: "scheduled",
          homeScore: null,
          awayScore: null,
        },
        {
          id: "26000000-0000-4000-8000-000000000202",
          seasonId: "26000000-0000-4000-8000-000000000027",
          roundNumber: 1,
          homeTeamId: "26000000-0000-4000-8000-000000000103",
          awayTeamId: "26000000-0000-4000-8000-000000000104",
          kickoffAt: "2026-10-17T18:30:00.000Z",
          status: "scheduled",
          homeScore: null,
          awayScore: null,
        },
        {
          id: "26000000-0000-4000-8000-000000000203",
          seasonId: "26000000-0000-4000-8000-000000000027",
          roundNumber: 1,
          homeTeamId: "26000000-0000-4000-8000-000000000105",
          awayTeamId: "26000000-0000-4000-8000-000000000106",
          kickoffAt: "2026-10-18T17:00:00.000Z",
          status: "scheduled",
          homeScore: null,
          awayScore: null,
        },
        {
          id: "26000000-0000-4000-8000-000000000204",
          seasonId: "26000000-0000-4000-8000-000000000027",
          roundNumber: 2,
          homeTeamId: "26000000-0000-4000-8000-000000000101",
          awayTeamId: "26000000-0000-4000-8000-000000000103",
          kickoffAt: "2026-10-24T16:00:00.000Z",
          status: "postponed",
          homeScore: null,
          awayScore: null,
        },
        {
          id: "26000000-0000-4000-8000-000000000205",
          seasonId: "26000000-0000-4000-8000-000000000027",
          roundNumber: 2,
          homeTeamId: "26000000-0000-4000-8000-000000000102",
          awayTeamId: "26000000-0000-4000-8000-000000000105",
          kickoffAt: "2026-10-24T18:30:00.000Z",
          status: "canceled",
          homeScore: null,
          awayScore: null,
        },
      ],
    });
  });
});
