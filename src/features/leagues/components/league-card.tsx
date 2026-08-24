import Link from "next/link";

import { StatusBadge } from "@/components/ui/status-badge";
import {
  getLeagueRoleLabel,
  getLeagueStatusLabel,
} from "@/features/leagues/display";
import type { LeagueDashboardItem } from "@/features/leagues/types";

function getStatusTone(status: LeagueDashboardItem["status"]) {
  if (status === "open") return "success" as const;
  if (status === "active") return "info" as const;
  if (status === "draft") return "warning" as const;
  return "locked" as const;
}

export function LeagueCard({ league }: { league: LeagueDashboardItem }) {
  return (
    <Link
      href={`/leagues/${league.id}`}
      className="group block h-full rounded-2xl border border-line bg-white p-5 shadow-card transition hover:border-navy-700 hover:shadow-card-hover sm:p-6"
      aria-label={`כניסה לליגה ${league.name}`}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 break-words text-xl font-extrabold leading-7 text-ink">
            {league.name}
          </h3>
          <StatusBadge tone={getStatusTone(league.status)}>
            {getLeagueStatusLabel(league.status)}
          </StatusBadge>
        </div>

        <dl className="grid min-w-0 gap-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-ink-muted">עונה</dt>
            <dd dir="auto" className="mt-1 break-words font-bold text-ink">
              {league.seasonName}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-ink-muted">התפקיד שלי</dt>
            <dd className="mt-1 break-words font-bold text-navy-700">
              {getLeagueRoleLabel(league.role)}
            </dd>
          </div>
        </dl>

        <span className="inline-flex min-h-11 items-center self-start font-extrabold text-navy-700 group-hover:underline">
          כניסה לליגה
          <span aria-hidden="true" className="ms-1">
            ←
          </span>
        </span>
      </div>
    </Link>
  );
}
