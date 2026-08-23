import type { SyncRunItem, SyncStatus } from "@/features/sync/types";

const statusLabels: Record<SyncStatus, string> = {
  running: "בתהליך",
  succeeded: "הושלם",
  failed: "נכשל",
  skipped: "דולג",
};

const skipReasonLabels: Record<string, string> = {
  CONCURRENT_ATTEMPT: "ניסיון מקביל כבר החזיק בנעילה הקצרה",
  MANUAL_PROVIDER: "המערכת מוגדרת למסלול ידני ללא ספק חי",
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
