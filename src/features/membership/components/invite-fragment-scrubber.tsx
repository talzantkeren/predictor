"use client";

import { useEffect } from "react";

export function InviteFragmentScrubber() {
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  return null;
}
