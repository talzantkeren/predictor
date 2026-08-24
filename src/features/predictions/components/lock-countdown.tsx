"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  formatRemainingDuration,
  getLockCountdownAnnouncement,
} from "@/features/predictions/display";

export function LockCountdown({
  initialSeconds,
  lockAt,
}: {
  initialSeconds: number;
  lockAt?: string;
}) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(initialSeconds);
  const refreshed = useRef(false);

  useEffect(() => {
    if (seconds <= 0) {
      if (!refreshed.current) {
        refreshed.current = true;
        router.refresh();
      }
      return;
    }

    const timer = window.setInterval(() => {
      setSeconds((current) => Math.max(0, current - 1));
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [router, seconds]);

  const announcement = getLockCountdownAnnouncement(seconds, lockAt);

  return (
    <span className="font-bold text-ink-secondary">
      <span aria-hidden="true">{formatRemainingDuration(seconds)}</span>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </span>
  );
}
