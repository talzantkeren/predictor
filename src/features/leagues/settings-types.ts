export type EditableLeagueStatus =
  | "draft"
  | "open"
  | "active"
  | "completed"
  | "archived";

export type EditableLeagueSettings = {
  id: string;
  name: string;
  description: string | null;
  status: EditableLeagueStatus;
  editorRole: "manager" | "system-admin";
  settingsVersion: number;
  demoEntryFeeAgorot: number;
  demoPaymentInstructions: string | null;
  joinsCloseAt: string | null;
  allowLateJoin: boolean;
  databaseTime: string;
  firstKickoffAt: string | null;
  hasStartedOrLatched: boolean;
  rulesLocked: boolean;
  scoring: {
    exactPoints: number;
    correctOutcomePoints: number;
    incorrectPoints: number;
    version: number;
    lockedAt: string | null;
  };
  prizes: {
    position: number;
    percentageBps: number;
  }[];
};

export function areLeagueRulesEffectivelyLocked(
  settings: EditableLeagueSettings,
) {
  return settings.rulesLocked;
}

export function formatUtcDateTimeLocalValue(value: string | null) {
  if (value === null) {
    return "";
  }

  const exactUtcValue =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,6})?(?:Z|\+00(?::?00)?)$/i.exec(
      value,
    );

  if (exactUtcValue) {
    return `${exactUtcValue[1]}${exactUtcValue[2] ?? ""}`;
  }

  const parsed = new Date(value);

  if (!Number.isFinite(parsed.getTime())) {
    return "";
  }

  // The explicitly labelled UTC text control keeps all six PostgreSQL
  // fractional digits. This fallback is only for an unexpected but still
  // valid non-UTC-offset representation from the gateway.
  return parsed.toISOString().replace(/Z$/, "");
}
