import {
  manualCompetition,
  manualFixtures,
  ManualSportsProvider,
} from "@/features/sports";

const provider = new ManualSportsProvider({
  competition: manualCompetition,
  fixtures: manualFixtures,
});

async function main() {
  const fixtures = await provider.getFixtures();
  const results = await provider.getResults();

  console.log(
    JSON.stringify(
      {
        provider: "manual",
        competition: manualCompetition.competitionId,
        fixtureCount: fixtures.length,
        resultCount: results.length,
        statuses: [...new Set(fixtures.map((fixture) => fixture.status))],
        liveScores: fixtures
          .filter((fixture) => fixture.status === "live")
          .map(({ matchId, homeScore, awayScore }) => ({
            matchId,
            homeScore,
            awayScore,
          })),
      },
      null,
      2,
    ),
  );
}

void main();
