import type { RawSportsMatch, SportsCompetition } from "@/features/sports/types";

export const manualCompetition: SportsCompetition = {
  competitionId: "israel-premier-league",
  name: "ליגת העל",
  countryCode: "IL",
};

const teams = {
  hapoel: { teamId: "team-hapoel", name: "הפועל תל אביב", shortName: "הפועל" },
  maccabi: { teamId: "team-maccabi", name: "מכבי תל אביב", shortName: "מכבי" },
  beitar: { teamId: "team-beitar", name: "בית״ר ירושלים", shortName: "בית״ר" },
  hapoelHaifa: { teamId: "team-hapoel-haifa", name: "הפועל חיפה", shortName: "חיפה" },
  ashdod: { teamId: "team-ashdod", name: "מ.ס. אשדוד", shortName: "אשדוד" },
  hapoelBeerSheva: { teamId: "team-hapoel-beer-sheva", name: "הפועל באר שבע", shortName: "באר שבע" },
} as const;

export const manualFixtures: readonly RawSportsMatch[] = [
  {
    matchId: "manual-scheduled-1",
    leagueId: "israel-premier-league",
    competitionId: manualCompetition.competitionId,
    seasonId: "2026-27",
    round: 1,
    homeTeam: teams.hapoel,
    awayTeam: teams.maccabi,
    kickoffAt: "2026-08-22T16:00:00.000Z",
    status: "scheduled",
  },
  {
    matchId: "manual-live-1",
    leagueId: "israel-premier-league",
    competitionId: manualCompetition.competitionId,
    seasonId: "2026-27",
    round: 1,
    homeTeam: teams.beitar,
    awayTeam: teams.hapoelHaifa,
    kickoffAt: "2026-08-22T18:30:00.000Z",
    status: "live",
    homeScore: 2,
    awayScore: 1,
  },
  {
    matchId: "manual-finished-1",
    leagueId: "israel-premier-league",
    competitionId: manualCompetition.competitionId,
    seasonId: "2026-27",
    round: 1,
    homeTeam: teams.ashdod,
    awayTeam: teams.hapoelBeerSheva,
    kickoffAt: "2026-08-21T16:00:00.000Z",
    status: "finished",
    homeScore: 1,
    awayScore: 1,
  },
  {
    matchId: "manual-postponed-1",
    leagueId: "israel-premier-league",
    competitionId: manualCompetition.competitionId,
    seasonId: "2026-27",
    round: 2,
    homeTeam: teams.hapoel,
    awayTeam: teams.beitar,
    kickoffAt: "2026-08-29T16:00:00.000Z",
    status: "postponed",
  },
  {
    matchId: "manual-canceled-1",
    leagueId: "israel-premier-league",
    competitionId: manualCompetition.competitionId,
    seasonId: "2026-27",
    round: 2,
    homeTeam: teams.maccabi,
    awayTeam: teams.ashdod,
    kickoffAt: "2026-08-29T18:30:00.000Z",
    status: "canceled",
  },
];
