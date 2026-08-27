import type { SyncRunItem, SyncStatus } from "@/features/sync/types";

const statusLabels: Record<SyncStatus, string> = {
  running: "בתהליך",
  succeeded: "הושלם",
  failed: "נכשל",
  skipped: "דולג",
};

const skipReasonLabels: Record<string, string> = {
  CONCURRENT_ATTEMPT: "ניסיון מקביל כבר החזיק בנעילה הקצרה",
  FORCE_COOLDOWN: "ניתן להפעיל סנכרון ידני פעם בדקה; יש להמתין לפני ניסיון נוסף",
  MANUAL_PROVIDER: "המערכת מוגדרת למסלול ידני ללא ספק חי",
  NOT_DUE: "לא הייתה עבודת סנכרון שמועד ביצועה הגיע",
  PROVIDER_BACKOFF: "הספק ביקש להמתין לפני ניסיון הסנכרון הבא",
};

export function getSyncStatusLabel(status: SyncStatus) {
  return statusLabels[status];
}

export function getSyncSkipReasonLabel(resultCode: string | null) {
  if (!resultCode) return "לא צוינה סיבת דילוג";
  return skipReasonLabels[resultCode] ?? "סיבת דילוג אחרת";
}

export function isFailedSyncRun(run: Pick<SyncRunItem, "status">) {
  return run.status === "failed";
}

export function getSyncFailureMessage(
  run: Pick<SyncRunItem, "status" | "errorMessageSafe">,
) {
  if (!isFailedSyncRun(run)) return null;
  return run.errorMessageSafe ?? "הריצה נכשלה ללא פרטים נוספים.";
}
