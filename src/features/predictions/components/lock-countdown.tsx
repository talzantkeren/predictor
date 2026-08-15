"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { formatRemainingDuration } from "@/features/predictions/display";

export function LockCountdown({ initialSeconds }: { initialSeconds: number }) {
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

  return (
    <span role="status" aria-live="polite" className="font-semibold text-slate-700">
      {formatRemainingDuration(seconds)}
    </span>
  );
}
