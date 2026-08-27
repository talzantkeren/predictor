import type { Metadata } from "next";
import Link from "@/components/ui/app-link";

import { IsolatedText } from "@/components/ui/isolated-text";
import { SkipToMainLink } from "@/components/ui/skip-to-main-link";
import { AppHeader } from "@/features/auth/components/app-header";
import { ProofUploadForm } from "@/features/files/components/proof-upload-form";
import { getInviteAccessTokenHash } from "@/features/membership/invite-access-server";
import { InviteBootstrap } from "@/features/membership/components/invite-bootstrap";
import { InviteFragmentScrubber } from "@/features/membership/components/invite-fragment-scrubber";
import { JoinRequestForm } from "@/features/membership/components/join-request-form";
import { ProofHistory } from "@/features/membership/components/proof-history";
import { UnavailableInvite } from "@/features/membership/components/unavailable-invite";
import {
  formatMembershipDate,
  getJoinRequestStatusLabel,
} from "@/features/membership/display";
import { resolveInvite } from "@/features/membership/queries";
import { isValidInvitePublicId } from "@/features/membership/invite-token";
import type { InviteResolution } from "@/features/membership/types";
import { formatDemoAmount } from "@/features/leagues/display";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "הזמנה לליגה — Predictor1",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  referrer: "no-referrer",
};

function InviteRequestSummary({
  resolution,
}: {
  resolution: InviteResolution;
}) {
  if (!resolution.joinRequestStatus || !resolution.requestCreatedAt) {
    return null;
  }

  return (
    <section
      aria-labelledby="invite-request-summary-title"
      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
    >
      <h3 id="invite-request-summary-title" className="font-bold text-slate-900">
        פרטי הבקשה
      </h3>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-slate-600">מצב</dt>
          <dd className="mt-1 text-slate-950">
            {getJoinRequestStatusLabel(resolution.joinRequestStatus)}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-600">נפתחה</dt>
          <dd className="mt-1 text-slate-950">
            <time dateTime={resolution.requestCreatedAt}>
              {formatMembershipDate(resolution.requestCreatedAt)}
            </time>
          </dd>
        </div>
        {resolution.requestUpdatedAt ? (
          <div>
            <dt className="font-semibold text-slate-600">עודכנה לאחרונה</dt>
            <dd className="mt-1 text-slate-950">
              <time dateTime={resolution.requestUpdatedAt}>
                {formatMembershipDate(resolution.requestUpdatedAt)}
              </time>
            </dd>
          </div>
        ) : null}
      </dl>
      {resolution.proofs.length > 0 ? (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <ProofHistory proofs={resolution.proofs} />
        </div>
      ) : null}
    </section>
  );
}

function InviteViewerPanel({
  resolution,
  publicId,
}: {
  resolution: InviteResolution;
  publicId: string;
}) {
  const nextPath = `/invite/${publicId}`;
  const encodedNextPath = encodeURIComponent(nextPath);

  if (resolution.viewerState === "guest") {
    return (
      <div className="space-y-4">
        <p className="leading-7 text-slate-700">
          כדי לפתוח בקשת הצטרפות יש להתחבר או ליצור חשבון. לאחר ההזדהות תחזרו להזמנה הזו.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/login?next=${encodedNextPath}`}
            prefetch={false}
            className="rounded-lg bg-blue-700 px-4 py-2.5 text-center font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            התחברות והמשך
          </Link>
          <Link
            href={`/register?next=${encodedNextPath}`}
            prefetch={false}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-center font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            יצירת חשבון
          </Link>
        </div>
      </div>
    );
  }

  if (
    resolution.viewerState === "eligible" ||
    resolution.viewerState === "rejected"
  ) {
    return (
      <div className="space-y-4">
        {resolution.viewerState === "rejected" ? (
          <>
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              בקשה קודמת הסתיימה. כל עוד הקישור והליגה זמינים, אפשר לפתוח בקשה חדשה.
            </p>
            <InviteRequestSummary resolution={resolution} />
          </>
        ) : null}
        <p className="leading-7 text-slate-700">
          פתיחת הבקשה אינה מצרפת לליגה מיד. הבקשה תתחיל בהמתנה לתמונת Demo.
        </p>
        <JoinRequestForm publicId={publicId} />
      </div>
    );
  }

  if (
    resolution.viewerState === "pending_proof" ||
    resolution.viewerState === "pending_approval"
  ) {
    if (!resolution.joinRequestId) {
      return (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
          לא ניתן לטעון את פרטי הבקשה כרגע. יש לרענן ולנסות שוב.
        </p>
      );
    }

    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-950">
          <h2 className="font-bold">
            {resolution.viewerState === "pending_proof"
              ? "הבקשה ממתינה לתמונת Demo"
              : "הבקשה ממתינה לבדיקת מנהל/ת הליגה"}
          </h2>
          <p className="mt-2 text-sm leading-6">
            {resolution.viewerState === "pending_proof"
              ? "יש להעלות תמונה סינתטית לצורך ההדגמה בלבד."
              : "אפשר להעלות תמונת Demo חלופית כל עוד הבקשה טרם הוכרעה."}
          </p>
        </div>

        <InviteRequestSummary resolution={resolution} />

        <ProofUploadForm
          requestId={resolution.joinRequestId}
          proofCount={resolution.proofs.length}
        />
      </div>
    );
  }

  const messages = {
    manager: "זו הליגה שלך. אין צורך לפתוח בקשת הצטרפות לעצמך.",
    active_member: "כבר יש לך חברות פעילה בליגה הזו.",
    approved: "בקשת ההצטרפות כבר אושרה.",
    closed: "הליגה אינה מקבלת בקשות הצטרפות חדשות כרגע.",
  } as const;
  const message = messages[resolution.viewerState];

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 leading-7 text-slate-700">
        {message}
      </p>
      {resolution.viewerState === "approved" ? (
        <InviteRequestSummary resolution={resolution} />
      ) : null}
      {resolution.viewerState !== "closed" ? (
        <Link
          href="/dashboard"
          className="inline-flex rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          מעבר ללוח האישי
        </Link>
      ) : null}
    </div>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authenticatedNavigation = user ? <AppHeader /> : undefined;

  if (!isValidInvitePublicId(publicId)) {
    return (
      <UnavailableInvite
        authenticatedNavigation={authenticatedNavigation}
      />
    );
  }

  const tokenHash = await getInviteAccessTokenHash(publicId);
  if (!tokenHash) {
    return (
      <InviteBootstrap
        authenticatedNavigation={authenticatedNavigation}
        publicId={publicId}
      />
    );
  }

  const result = await resolveInvite(supabase, publicId, tokenHash);

  if (result.status !== "found") {
    return (
      <InviteBootstrap
        authenticatedNavigation={authenticatedNavigation}
        publicId={publicId}
      />
    );
  }

  const resolution = result.data;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      {resolution.viewerState !== "guest" ? <AppHeader /> : <SkipToMainLink />}
      <main
        id="main-content"
        tabIndex={-1}
        className="px-4 py-8 outline-none sm:px-6 sm:py-12"
      >
        <InviteFragmentScrubber />
        <div className="mx-auto max-w-3xl space-y-6">
        <section
          aria-labelledby="invite-title"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <p className="text-sm font-semibold text-blue-700">הזמנה לליגה פרטית</p>
          <h1 id="invite-title" className="mt-2 break-words text-3xl font-bold tracking-tight">
            <IsolatedText>{resolution.leagueName}</IsolatedText>
          </h1>
          <dl className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-semibold text-slate-600">סכום הדגמה</dt>
              <dd className="mt-1 text-lg font-bold text-slate-950">
                {formatDemoAmount(resolution.demoEntryFeeAgorot)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-600">סגירת הצטרפות</dt>
              <dd className="mt-1 text-slate-950">
                {resolution.joinsCloseAt ? (
                  <time dateTime={resolution.joinsCloseAt}>
                    {formatMembershipDate(resolution.joinsCloseAt)}
                  </time>
                ) : (
                  "לא הוגדר מועד"
                )}
              </dd>
            </div>
          </dl>
          {resolution.demoPaymentInstructions ? (
            <div className="mt-5">
              <h2 className="font-bold">הוראות Demo</h2>
              <p className="mt-2 whitespace-pre-wrap leading-7 text-slate-700">
                <IsolatedText>{resolution.demoPaymentInstructions}</IsolatedText>
              </p>
            </div>
          ) : null}
        </section>

        <aside
          className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950"
          aria-label="הודעת מצב Demo"
        >
          <h2 className="font-bold">Demo בלבד — ללא כסף אמיתי</h2>
          <p className="mt-2 text-sm leading-6">
            אין להעביר כסף ואין להעלות מסמך פיננסי אמיתי. תמונה שתועלה היא דוגמה בלבד ואינה מוכיחה העברה או תשלום.
          </p>
        </aside>

        <section
          aria-labelledby="invite-action-title"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <h2 id="invite-action-title" className="text-2xl font-bold">
            מצב ההצטרפות
          </h2>
          <div className="mt-5">
            <InviteViewerPanel resolution={resolution} publicId={publicId} />
          </div>
        </section>
        </div>
      </main>
    </div>
  );
}
