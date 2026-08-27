import Link from "next/link";

type LeagueSection =
  | "overview"
  | "matches"
  | "standings"
  | "members"
  | "reports"
  | "settings";

const commonItems: { key: LeagueSection; label: string; suffix: string }[] = [
  { key: "overview", label: "סקירה", suffix: "" },
  { key: "matches", label: "משחקים וניחושים", suffix: "/matches" },
  { key: "standings", label: "טבלת דירוג", suffix: "/standings" },
  { key: "members", label: "חברים", suffix: "/members" },
];

const managerItems: { key: LeagueSection; label: string; suffix: string }[] = [
  { key: "reports", label: "דוחות", suffix: "/reports" },
  { key: "settings", label: "הגדרות", suffix: "/settings" },
];

const settingsItem = managerItems[managerItems.length - 1];

export function LeagueTabs({
  leagueId,
  active,
  isManager,
  canManageSettings = isManager,
}: {
  leagueId: string;
  active: LeagueSection;
  isManager: boolean;
  canManageSettings?: boolean;
}) {
  const items = isManager
    ? [...commonItems, ...managerItems]
    : canManageSettings && settingsItem
      ? [settingsItem]
      : commonItems;

  return (
    <div className="relative border-b border-line bg-white">
      <nav
        aria-label="ניווט בליגה"
        className="mx-auto flex min-h-14 w-full max-w-6xl snap-x items-stretch gap-1 overflow-x-auto px-4 [scrollbar-width:thin] sm:px-6 lg:px-8"
      >
        {items.map((item) => {
          const current = item.key === active;
          return (
            <Link
              key={item.key}
              href={`/leagues/${leagueId}${item.suffix}`}
              aria-current={current ? "page" : undefined}
              className={`relative inline-flex min-h-12 shrink-0 snap-start items-center px-4 text-sm font-bold transition ${
                current
                  ? "text-navy-900 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-navy-700"
                  : "text-ink-secondary hover:bg-surface-subtle hover:text-navy-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-px left-0 w-6 bg-linear-to-r from-white to-transparent md:hidden"
      />
    </div>
  );
}
