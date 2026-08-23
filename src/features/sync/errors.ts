export type SyncErrorCode =
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "SYNC_NOT_CONFIGURED"
  | "SYNC_UNAVAILABLE"
  | "UNAUTHORIZED";

const safeSyncMessages: Record<SyncErrorCode, string> = {
  FORBIDDEN: "זהות המערכת אינה מורשית לתעד ניסיון סנכרון.",
  INVALID_REQUEST: "בקשת הסנכרון אינה תקינה.",
  SYNC_NOT_CONFIGURED: "שירות הסנכרון הידני אינו מוגדר בסביבה זו.",
  SYNC_UNAVAILABLE: "לא ניתן לתעד את ניסיון הסנכרון כרגע.",
  UNAUTHORIZED: "בקשת הסנכרון אינה מורשית.",
};

export class SyncError extends Error {
  readonly code: SyncErrorCode;
  readonly status: number;

  constructor(
    code: SyncErrorCode,
    status: number,
    options: { cause?: unknown } = {},
  ) {
    super(safeSyncMessages[code], { cause: options.cause });
    this.name = "SyncError";
    this.code = code;
    this.status = status;
  }
}

export function getSyncError(error: unknown) {
  return error instanceof SyncError
    ? error
    : new SyncError("SYNC_UNAVAILABLE", 503, { cause: error });
}

export function getDatabaseSyncError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    error.message === "FORBIDDEN"
  ) {
    return new SyncError("FORBIDDEN", 403, { cause: error });
  }

  return new SyncError("SYNC_UNAVAILABLE", 503, { cause: error });
}
