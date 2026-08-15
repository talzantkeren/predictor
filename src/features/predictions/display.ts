import type { MatchStatus } from "@/features/predictions/types";

export const DEFAULT_MATCH_TIME_ZONE = "Asia/Jerusalem";

const matchStatusLabels: Record<MatchStatus, string> = {
  scheduled: "מתוכנן",
  live: "בשידור חי",
  finished: "הסתיים",
  postponed: "נדחה",
  canceled: "בוטל",
};

export type PredictionDisplayState =
  | "open"
  | "saved"
  | "editable"
  | "locked"
  | "unavailable";

const predictionStateLabels: Record<PredictionDisplayState, string> = {
  open: "פתוח לניחוש",
  saved: "הניחוש נשמר",
  editable: "נשמר ופתוח לעריכה",
  locked: "נעול",
  unavailable: "לא זמין לניחוש",
};

export function getMatchStatusLabel(status: MatchStatus) {
  return matchStatusLabels[status];
}

export function getPredictionStateLabel(state: PredictionDisplayState) {
  return predictionStateLabels[state];
}

function parseInstant(value: string) {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error("Invalid prediction timestamp");
  }
  return timestamp;
}

export function isKickoffLocked(kickoffAt: string, now: string | Date) {
  const kickoff = parseInstant(kickoffAt).getTime();
  const current = typeof now === "string" ? parseInstant(now).getTime() : now.getTime();
  return current >= kickoff;
}

export function canWritePrediction({
  status,
  kickoffAt,
  now,
  isActiveMember,
}: {
  status: MatchStatus;
  kickoffAt: string;
  now: string | Date;
  isActiveMember: boolean;
}) {
  return (
    isActiveMember &&
    (status === "scheduled" || status === "postponed") &&
    !isKickoffLocked(kickoffAt, now)
  );
}

export function derivePredictionDisplayState({
  status,
  kickoffAt,
  now,
  isActiveMember,
  hasPrediction,
}: {
  status: MatchStatus;
  kickoffAt: string;
  now: string | Date;
  isActiveMember: boolean;
  hasPrediction: boolean;
}): PredictionDisplayState {
  if (
    canWritePrediction({ status, kickoffAt, now, isActiveMember })
  ) {
    return hasPrediction ? "editable" : "open";
  }

  if (isKickoffLocked(kickoffAt, now)) {
    return "locked";
  }

  return "unavailable";
}

export function getCountdownSeconds(kickoffAt: string, now: string | Date) {
  const kickoff = parseInstant(kickoffAt).getTime();
  const current = typeof now === "string" ? parseInstant(now).getTime() : now.getTime();
  return Math.max(0, Math.ceil((kickoff - current) / 1_000));
}

export function formatRemainingDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds === 0) return "הניחוש נעול";

  const days = Math.floor(safeSeconds / 86_400);
  const hours = Math.floor((safeSeconds % 86_400) / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (days > 0) return `נותרו ${days} ימים ו־${hours} שעות`;
  if (hours > 0) return `נותרו ${hours} שעות ו־${minutes} דקות`;
  if (minutes > 0) return `נותרו ${minutes} דקות ו־${remainingSeconds} שניות`;
  return `נותרו ${remainingSeconds} שניות`;
}

export function formatDateTimeInTimeZone(
  instant: string,
  timeZone: string,
  locale = "he-IL",
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(parseInstant(instant));
}

function getTimeZoneOffsetMilliseconds(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return (
    Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
    ) - Math.floor(instant.getTime() / 1_000) * 1_000
  );
}

function zonedMidnightToUtc(date: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  let candidate = Date.UTC(year, month - 1, day);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset = getTimeZoneOffsetMilliseconds(new Date(candidate), timeZone);
    const nextCandidate = Date.UTC(year, month - 1, day) - offset;
    if (nextCandidate === candidate) break;
    candidate = nextCandidate;
  }

  return new Date(candidate);
}

export function getUtcDateRange(date: string, timeZone = DEFAULT_MATCH_TIME_ZONE) {
  const start = zonedMidnightToUtc(date, timeZone);
  const [year, month, day] = date.split("-").map(Number);
  const nextCalendarDate = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDate = [
    nextCalendarDate.getUTCFullYear().toString().padStart(4, "0"),
    (nextCalendarDate.getUTCMonth() + 1).toString().padStart(2, "0"),
    nextCalendarDate.getUTCDate().toString().padStart(2, "0"),
  ].join("-");

  return {
    start: start.toISOString(),
    end: zonedMidnightToUtc(nextDate, timeZone).toISOString(),
  };
}
