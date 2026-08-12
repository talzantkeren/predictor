import { normalizeMatch } from "@/features/sports/normalization";
import type {
  FixtureQuery,
  NormalizedMatch,
  RawSportsMatch,
  SportsCompetition,
  SportsProvider,
  SportsTeam,
} from "@/features/sports/types";

export interface ManualSportsProviderOptions {
  competition: SportsCompetition;
  fixtures: readonly RawSportsMatch[];
}

function matchesQuery(match: NormalizedMatch, query: FixtureQuery) {
  if (!query) return true;
  if ("round" in query) return match.round === query.round;
  return match.kickoffAt.slice(0, 10) === query.date;
}

export class ManualSportsProvider implements SportsProvider {
  private readonly competition: SportsCompetition;
  private readonly rawFixtures: readonly RawSportsMatch[];

  constructor(options: ManualSportsProviderOptions) {
    this.competition = { ...options.competition };
    this.rawFixtures = options.fixtures.map((fixture) => ({
      ...fixture,
      homeTeam: { ...fixture.homeTeam },
      awayTeam: { ...fixture.awayTeam },
    }));
  }

  async getCompetition() {
    return { ...this.competition };
  }

  async getTeams(seasonId: string): Promise<SportsTeam[]> {
    const teams = new Map<string, SportsTeam>();
    for (const fixture of this.rawFixtures) {
      if (fixture.seasonId !== seasonId) continue;
      teams.set(fixture.homeTeam.teamId, { ...fixture.homeTeam });
      teams.set(fixture.awayTeam.teamId, { ...fixture.awayTeam });
    }
    return [...teams.values()];
  }

  async getFixtures(query?: FixtureQuery): Promise<NormalizedMatch[]> {
    return this.rawFixtures
      .map(normalizeMatch)
      .filter((match) => matchesQuery(match, query));
  }

  async getResults(query?: FixtureQuery): Promise<NormalizedMatch[]> {
    return (await this.getFixtures(query)).filter(
      (match) => match.status === "finished",
    );
  }
}
