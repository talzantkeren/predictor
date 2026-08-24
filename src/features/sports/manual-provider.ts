import { normalizeMatch } from "@/features/sports/normalization";
import type {
  FixtureQuery,
  NormalizedMatch,
  RawSportsMatch,
  SportsCompetition,
  SportsProvider,
  SportsSyncPlan,
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
  readonly providerId = "manual" as const;
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

  async getRounds(seasonId: string) {
    const fixtures = this.rawFixtures.filter(
      (fixture) => fixture.seasonId === seasonId,
    );
    const rounds = new Map<number, string>();
    for (const fixture of fixtures) {
      rounds.set(fixture.round, fixture.roundLabel ?? `Round ${fixture.round}`);
    }
    return [...rounds.entries()]
      .sort(([left], [right]) => left - right)
      .map(([roundNumber, label]) => ({
        label,
        roundNumber,
        requiresReview: false,
      }));
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
  async getSyncSnapshot(plan: SportsSyncPlan) {
    const fixtures =
      plan.kind === "targeted"
        ? (await this.getFixtures()).filter((fixture) =>
            plan.fixtureIds.includes(fixture.matchId),
          )
        : await this.getFixtures();
    const seasonId = fixtures[0]?.seasonId ?? "2026-27";

    return {
      provider: this.providerId,
      plan,
      competition: await this.getCompetition(),
      season: null,
      teams: await this.getTeams(seasonId),
      rounds: await this.getRounds(seasonId),
      fixtures,
      quota: {
        dailyLimit: null,
        dailyRemaining: null,
        minuteLimit: null,
        minuteRemaining: null,
      },
    };
  }
}
