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
    <span>
      <time dateTime={instant}>{text}</time>
      <span className="sr-only"> אזור זמן </span>
      <span className="whitespace-nowrap text-xs text-slate-500">
        {timeZone}
      </span>
    </span>
  );
}
