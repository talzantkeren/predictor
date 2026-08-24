import "server-only";

import {
  ApiFootballClient,
  type ApiFootballTransport,
} from "@/features/sports/api-football-client";
import { ApiFootballProvider } from "@/features/sports/api-football-provider";
import { manualCompetition, manualFixtures } from "@/features/sports/fixtures";
import { ManualSportsProvider } from "@/features/sports/manual-provider";
import type { SportsProvider, SportsProviderId } from "@/features/sports/types";

export function createSportsProvider(options: {
  provider: SportsProviderId;
  apiKey?: string;
  transport?: ApiFootballTransport;
}): SportsProvider {
  if (options.provider === "manual") {
    return new ManualSportsProvider({
      competition: manualCompetition,
      fixtures: manualFixtures,
    });
  }

  if (!options.apiKey) {
    throw new Error("API-Football is not configured.");
  }
  return new ApiFootballProvider(
    new ApiFootballClient({
      apiKey: options.apiKey,
      transport: options.transport,
    }),
  );
}
