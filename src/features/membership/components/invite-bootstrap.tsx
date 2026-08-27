"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { SkipToMainLink } from "@/components/ui/skip-to-main-link";
import { parseInviteSecretFragment } from "@/features/membership/invite-fragment";
import { hashInviteToken } from "@/features/membership/invite-token";
import { UnavailableInvite } from "@/features/membership/components/unavailable-invite";

export function InviteBootstrap({
  authenticatedNavigation,
  publicId,
}: {
  authenticatedNavigation?: ReactNode;
  publicId: string;
}) {
  const router = useRouter();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    const rawToken = parseInviteSecretFragment(window.location.hash);

    // Replace the current history entry before any network operation. The raw
    // bearer stays in this closure only; it is never part of a request target.
    window.history.replaceState(null, "", window.location.pathname);

    void (async () => {
      try {
        if (!rawToken) {
          throw new Error("INVITE_FRAGMENT_UNAVAILABLE");
        }

        const tokenHash = await hashInviteToken(rawToken);
        const response = await fetch(`/api/invites/${publicId}/exchange`, {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenHash }),
          referrerPolicy: "no-referrer",
        });

        if (!response.ok) {
          throw new Error("INVITE_EXCHANGE_FAILED");
        }

        if (active) {
          router.refresh();
        }
      } catch {
        if (active) {
          setUnavailable(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [publicId, router]);

  if (unavailable) {
    return (
      <UnavailableInvite authenticatedNavigation={authenticatedNavigation} />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <SkipToMainLink />
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-screen px-4 py-8 outline-none sm:px-6 sm:py-12"
      >
        <section
          aria-labelledby="invite-loading-title"
          aria-live="polite"
          className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <p className="text-sm font-semibold text-blue-700">Predictor1</p>
          <h1 id="invite-loading-title" className="mt-2 text-3xl font-bold">
            מאמתים את קישור ההזמנה
          </h1>
          <p className="mt-3 leading-7 text-slate-600">
            רגע אחד, פרטי ההזמנה נטענים באופן מאובטח.
          </p>
        </section>
      </main>
    </div>
  );
}
