import { z } from "zod";

import {
  MANUAL_CATALOG_ID,
  MANUAL_COMPETITION_ID,
  MANUAL_SEASON_ID,
} from "@/features/sports/fixtures";
import type { SportsSyncSnapshot } from "@/features/sports/types";

const manualCatalogTeamSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(100),
  shortName: z.string().min(2).max(30),
});

const manualCatalogMatchSchema = z.object({
  id: z.string().uuid(),
  seasonId: z.literal(MANUAL_SEASON_ID),
  roundNumber: z.number().int().positive(),
  homeTeamId: z.string().uuid(),
  awayTeamId: z.string().uuid(),
  kickoffAt: z.string().datetime({ offset: true }),
  status: z.enum(["scheduled", "postponed", "canceled"]),
  homeScore: z.null(),
  awayScore: z.null(),
});

export const manualCatalogPayloadSchema = z.object({
  catalogId: z.literal(MANUAL_CATALOG_ID),
  competitionId: z.literal(MANUAL_COMPETITION_ID),
  seasonId: z.literal(MANUAL_SEASON_ID),
  teams: z.array(manualCatalogTeamSchema).length(6),
  matches: z.array(manualCatalogMatchSchema).length(5),
});

export type ManualCatalogPayload = z.infer<typeof manualCatalogPayloadSchema>;

export function buildManualCatalogPayload(
  snapshot: SportsSyncSnapshot,
): ManualCatalogPayload {
  if (
    snapshot.provider !== "manual" ||
    snapshot.competition?.competitionId !== MANUAL_COMPETITION_ID ||
    snapshot.fixtures.some(
      (fixture) =>
        fixture.competitionId !== MANUAL_COMPETITION_ID ||
        fixture.seasonId !== MANUAL_SEASON_ID ||
        fixture.resultDisposition !== "none" ||
        fixture.homeScore !== null ||
        fixture.awayScore !== null,
    )
  ) {
    throw new Error("The Manual sports catalog does not match manual-catalog-v1.");
  }

  return manualCatalogPayloadSchema.parse({
    catalogId: MANUAL_CATALOG_ID,
    competitionId: MANUAL_COMPETITION_ID,
    seasonId: MANUAL_SEASON_ID,
    teams: snapshot.teams.map((team) => ({
      id: team.teamId,
      name: team.name,
      shortName: team.shortName,
    })),
    matches: snapshot.fixtures.map((fixture) => ({
      id: fixture.matchId,
      seasonId: fixture.seasonId,
      roundNumber: fixture.round,
      homeTeamId: fixture.homeTeam.teamId,
      awayTeamId: fixture.awayTeam.teamId,
      kickoffAt: fixture.kickoffAt,
      status: fixture.status,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
    })),
  });
}
