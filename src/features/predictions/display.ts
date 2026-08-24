import type {
  LeagueStatus,
  MatchStatus,
} from "@/features/predictions/types";

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

export function getProviderReviewLabel(providerStatus: string | null) {
  return providerStatus === "AET" || providerStatus === "PEN"
    ? "דורש בדיקה"
    : null;
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
  leagueStatus,
  status,
  kickoffAt,
  predictionsLockedAt = null,
  now,
  isActiveMember,
}: {
  leagueStatus: LeagueStatus;
  status: MatchStatus;
  kickoffAt: string;
  predictionsLockedAt?: string | null;
  now: string | Date;
  isActiveMember: boolean;
}) {
  return (
    isActiveMember &&
    leagueStatus !== "completed" &&
    leagueStatus !== "archived" &&
    (status === "scheduled" || status === "postponed") &&
    predictionsLockedAt === null &&
    !isKickoffLocked(kickoffAt, now)
  );
}

export function derivePredictionDisplayState({
  leagueStatus,
  status,
  kickoffAt,
  predictionsLockedAt = null,
  now,
  isActiveMember,
  hasPrediction,
}: {
  leagueStatus: LeagueStatus;
  status: MatchStatus;
  kickoffAt: string;
  predictionsLockedAt?: string | null;
  now: string | Date;
  isActiveMember: boolean;
  hasPrediction: boolean;
}): PredictionDisplayState {
  if (
    canWritePrediction({
      leagueStatus,
      status,
      kickoffAt,
      predictionsLockedAt,
      now,
      isActiveMember,
    })
  ) {
    return hasPrediction ? "editable" : "open";
  }

  if (predictionsLockedAt !== null || isKickoffLocked(kickoffAt, now)) {
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

  const daysText = days === 1 ? "יום אחד" : `${days} ימים`;
  const hoursText = hours === 1 ? "שעה אחת" : `${hours} שעות`;
  const minutesText = minutes === 1 ? "דקה אחת" : `${minutes} דקות`;
  const secondsText =
    remainingSeconds === 1 ? "שנייה אחת" : `${remainingSeconds} שניות`;

  if (days > 0) {
    if (hours > 0) return `נותרו ${daysText} ו־${hoursText}`;
    return days === 1 ? `נותר ${daysText}` : `נותרו ${daysText}`;
  }
  if (hours > 0) {
    if (minutes > 0) return `נותרו ${hoursText} ו־${minutesText}`;
    return hours === 1 ? `נותרה ${hoursText}` : `נותרו ${hoursText}`;
  }
  if (minutes > 0) {
    if (remainingSeconds > 0) {
      return `נותרו ${minutesText} ו־${secondsText}`;
    }
    return minutes === 1 ? `נותרה ${minutesText}` : `נותרו ${minutesText}`;
  }
  return remainingSeconds === 1
    ? `נותרה ${secondsText}`
    : `נותרו ${secondsText}`;
}

export function getLockCountdownAnnouncement(
  seconds: number,
  lockAt?: string,
  timeZone = DEFAULT_MATCH_TIME_ZONE,
) {
  if (seconds <= 0) return "הניחוש נעול";

  if (seconds > 86_400) {
    return lockAt
      ? `הניחוש פתוח עד ${formatDateTimeInTimeZone(lockAt, timeZone)}`
      : `הניחוש פתוח. ${formatRemainingDuration(seconds)}`;
  }

  const announcedMinutes = Math.ceil(seconds / 60);
  return announcedMinutes <= 1
    ? "נותרה פחות מדקה עד לנעילת הניחוש"
    : `נותרו ${announcedMinutes} דקות עד לנעילת הניחוש`;
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
