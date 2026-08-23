import type {
  LeagueRole,
  SeasonOption,
} from "@/features/leagues/types";
import type { Database } from "@/types/database.generated";

type LeagueStatus = Database["public"]["Enums"]["league_status"];

const statusLabels: Record<LeagueStatus, string> = {
  draft: "טיוטה",
  open: "פתוחה להצטרפות",
  active: "פעילה",
  completed: "הסתיימה",
  archived: "בארכיון",
};

const roleLabels: Record<LeagueRole, string> = {
  manager: "מנהל/ת וחבר/ה פעיל/ה",
  member: "חבר/ה פעיל/ה",
};

export function getLeagueStatusLabel(status: LeagueStatus) {
  return statusLabels[status];
}

export function getLeagueRoleLabel(role: LeagueRole) {
  return roleLabels[role];
}

export function formatDemoAmount(agorot: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
  }).format(agorot / 100);
}

export function formatPrizePercentage(basisPoints: number) {
  return new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: basisPoints % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(basisPoints / 100);
}

export function getSeasonSourceLabel(
  externalProvider: string | null,
): SeasonOption["sourceLabel"] {
  return externalProvider === "api-football" ? "API-Football" : "Demo";
}
