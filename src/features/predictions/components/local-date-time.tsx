"use client";

import { useSyncExternalStore } from "react";

import { formatDateTimeInTimeZone } from "@/features/predictions/display";

export function LocalDateTime({
  instant,
  initialText,
  initialTimeZone,
}: {
  instant: string;
  initialText: string;
  initialTimeZone: string;
}) {
  const timeZone = useSyncExternalStore(
    () => () => undefined,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || initialTimeZone,
    () => initialTimeZone,
  );
  const text =
    timeZone === initialTimeZone
      ? initialText
      : formatDateTimeInTimeZone(instant, timeZone);

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1">
      <time dateTime={instant}>{text}</time>
      <span className="sr-only"> אזור זמן </span>
      <span dir="ltr" className="whitespace-nowrap text-xs text-ink-muted">
        {timeZone}
      </span>
    </span>
  );
}
