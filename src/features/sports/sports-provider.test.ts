import { describe, expect, it } from "vitest";

import {
  manualCompetition,
  manualFixtures,
  ManualSportsProvider,
  normalizeMatch,
} from "@/features/sports";
import type { RawSportsMatch } from "@/features/sports";

const provider = new ManualSportsProvider({
  competition: manualCompetition,
  fixtures: manualFixtures,
});

describe("ManualSportsProvider normalization", () => {
  it("normalizes every supported fixture status", async () => {
    const fixtures = await provider.getFixtures();

    expect(fixtures.map((fixture) => fixture.status)).toEqual([
      "scheduled",
      "live",
      "finished",
      "postponed",
      "canceled",
    ]);
  });

  it("keeps scores only for a finished official result", async () => {
    const fixtures = await provider.getFixtures();
    const byStatus = new Map(fixtures.map((fixture) => [fixture.status, fixture]));

    expect(byStatus.get("scheduled")).toMatchObject({
      homeScore: null,
      awayScore: null,
    });
    expect(byStatus.get("live")).toMatchObject({
      homeScore: null,
      awayScore: null,
    });
    expect(byStatus.get("finished")).toMatchObject({
      homeScore: 1,
      awayScore: 1,
    });
    expect(byStatus.get("postponed")).toMatchObject({
      homeScore: null,
      awayScore: null,
    });
    expect(byStatus.get("canceled")).toMatchObject({
      homeScore: null,
      awayScore: null,
    });
  });

  it("rejects an unknown provider status", () => {
    expect(() =>
      normalizeMatch({
        ...manualFixtures[0],
        status: "halftime",
      }),
    ).toThrow("Unsupported sports match status");
  });

  it("requires an official score for finished matches", () => {
    expect(() =>
      normalizeMatch({
        ...manualFixtures[0],
        status: "finished",
      }),
    ).toThrow("Finished matches require");
  });

  it("does not mutate the source fixture when normalizing", async () => {
    const sourceBefore = structuredClone(manualFixtures);

    await provider.getFixtures();

    expect(manualFixtures).toEqual(sourceBefore);
  });

  it("filters fixtures and returns only official results", async () => {
    await expect(provider.getFixtures({ round: 2 })).resolves.toHaveLength(2);
    await expect(provider.getResults()).resolves.toHaveLength(1);
  });

  it("normalizes common external aliases without changing the contract", () => {
    const input: RawSportsMatch = {
      ...manualFixtures[0],
      status: "FT",
      homeScore: 2,
      awayScore: 0,
    };

    expect(normalizeMatch(input)).toMatchObject({
      status: "finished",
      homeScore: 2,
      awayScore: 0,
    });
  });

  it("rejects a kickoff timestamp without an explicit timezone", () => {
    expect(() =>
      normalizeMatch({
        ...manualFixtures[0],
        kickoffAt: "2026-08-22T16:00:00",
      }),
    ).toThrow("explicit offset");
  });

  it("normalizes an offset kickoff timestamp deterministically to UTC", () => {
    const normalized = normalizeMatch({
      ...manualFixtures[0],
      kickoffAt: "2026-08-22T19:00:00+03:00",
    });

    expect(normalized.kickoffAt).toBe("2026-08-22T16:00:00.000Z");
  });

  it("rejects an invalid calendar timestamp", () => {
    expect(() =>
      normalizeMatch({
        ...manualFixtures[0],
        kickoffAt: "2026-13-42T19:00:00+03:00",
      }),
    ).toThrow("valid timestamp");
  });
});
