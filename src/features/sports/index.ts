export {
  MANUAL_CATALOG_ID,
  MANUAL_COMPETITION_ID,
  MANUAL_SEASON_ID,
  manualCompetition,
  manualFixtures,
} from "@/features/sports/fixtures";
export {
  buildManualCatalogPayload,
  manualCatalogPayloadSchema,
} from "@/features/sports/manual-catalog";
export type { ManualCatalogPayload } from "@/features/sports/manual-catalog";
export { ManualSportsProvider } from "@/features/sports/manual-provider";
export { normalizeMatch } from "@/features/sports/normalization";
export { planSyncResults } from "@/features/sports/sync-planner";
export type * from "@/features/sports/types";
export type {
  PlannedMatchResult,
  StoredMatchSnapshot,
} from "@/features/sports/sync-planner";
