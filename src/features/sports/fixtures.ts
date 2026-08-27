import type { RawSportsMatch, SportsCompetition } from "@/features/sports/types";

export const MANUAL_CATALOG_ID = "manual-catalog-v1";
export const MANUAL_COMPETITION_ID = "26000000-0000-4000-8000-000000000001";
export const MANUAL_SEASON_ID = "26000000-0000-4000-8000-000000000027";

export const manualCompetition: SportsCompetition = {
  competitionId: MANUAL_COMPETITION_ID,
  name: "ליגת העל הישראלית",
  countryCode: "IL",
};

const teams = {
  hapoelTelAviv: {
    teamId: "26000000-0000-4000-8000-000000000101",
    name: "הפועל תל אביב",
    shortName: "הפועל תל אביב",
  },
  maccabiTelAviv: {
    teamId: "26000000-0000-4000-8000-000000000102",
    name: "מכבי תל אביב",
    shortName: "מכבי תל אביב",
  },
  beitarJerusalem: {
    teamId: "26000000-0000-4000-8000-000000000103",
    name: "בית״ר ירושלים",
    shortName: "בית״ר",
  },
  hapoelHaifa: {
    teamId: "26000000-0000-4000-8000-000000000104",
    name: "הפועל חיפה",
    shortName: "הפועל חיפה",
  },
  ashdod: {
    teamId: "26000000-0000-4000-8000-000000000105",
    name: "מ.ס. אשדוד",
    shortName: "אשדוד",
  },
  hapoelBeerSheva: {
    teamId: "26000000-0000-4000-8000-000000000106",
    name: "הפועל באר שבע",
    shortName: "באר שבע",
  },
} as const;

export const manualFixtures: readonly RawSportsMatch[] = [
  {
    matchId: "26000000-0000-4000-8000-000000000201",
    leagueId: MANUAL_COMPETITION_ID,
    competitionId: MANUAL_COMPETITION_ID,
    seasonId: MANUAL_SEASON_ID,
    round: 1,
    homeTeam: teams.hapoelTelAviv,
    awayTeam: teams.maccabiTelAviv,
    kickoffAt: "2026-10-17T16:00:00.000Z",
    status: "scheduled",
  },
  {
    matchId: "26000000-0000-4000-8000-000000000202",
    leagueId: MANUAL_COMPETITION_ID,
    competitionId: MANUAL_COMPETITION_ID,
    seasonId: MANUAL_SEASON_ID,
    round: 1,
    homeTeam: teams.beitarJerusalem,
    awayTeam: teams.hapoelHaifa,
    kickoffAt: "2026-10-17T18:30:00.000Z",
    status: "scheduled",
  },
  {
    matchId: "26000000-0000-4000-8000-000000000203",
    leagueId: MANUAL_COMPETITION_ID,
    competitionId: MANUAL_COMPETITION_ID,
    seasonId: MANUAL_SEASON_ID,
    round: 1,
    homeTeam: teams.ashdod,
    awayTeam: teams.hapoelBeerSheva,
    kickoffAt: "2026-10-18T17:00:00.000Z",
    status: "scheduled",
  },
  {
    matchId: "26000000-0000-4000-8000-000000000204",
    leagueId: MANUAL_COMPETITION_ID,
    competitionId: MANUAL_COMPETITION_ID,
    seasonId: MANUAL_SEASON_ID,
    round: 2,
    homeTeam: teams.hapoelTelAviv,
    awayTeam: teams.beitarJerusalem,
    kickoffAt: "2026-10-24T16:00:00.000Z",
    status: "postponed",
  },
  {
    matchId: "26000000-0000-4000-8000-000000000205",
    leagueId: MANUAL_COMPETITION_ID,
    competitionId: MANUAL_COMPETITION_ID,
    seasonId: MANUAL_SEASON_ID,
    round: 2,
    homeTeam: teams.maccabiTelAviv,
    awayTeam: teams.ashdod,
    kickoffAt: "2026-10-24T18:30:00.000Z",
    status: "canceled",
  },
];
