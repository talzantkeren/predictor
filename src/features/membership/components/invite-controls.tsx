"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/features/auth/components/form-message";
import {
  createOrRotateInviteAction,
  type MembershipActionState,
  revokeInviteAction,
} from "@/features/membership/actions";
import {
  formatMembershipDate,
  getInviteEffectiveStatus,
  isInviteEffectivelyActive,
} from "@/features/membership/display";
import { buildInviteShareUrl } from "@/features/membership/invite-fragment";
import type { InviteMetadata } from "@/features/membership/types";

export function InviteControls({
  leagueId,
  invite,
  applicationOrigin,
}: {
  leagueId: string;
  invite: InviteMetadata | null;
  applicationOrigin: string;
}) {
  const initialState: MembershipActionState = { status: "idle" };
  const [createState, createAction, createPending] = useActionState(
    createOrRotateInviteAction,
    initialState,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokeInviteAction,
    initialState,
  );
  const [copiedMessage, setCopiedMessage] = useState<string>();
  const actionSucceeded =
    createState.status === "success" || revokeState.status === "success";
  const inviteEffectiveStatus = invite
    ? getInviteEffectiveStatus(invite)
    : null;
  const inviteActive =
    Boolean(invite && isInviteEffectivelyActive(invite)) &&
    revokeState.status !== "success";
  const shareableLink =
    createState.publicId && createState.rawToken
      ? buildInviteShareUrl(
          applicationOrigin,
          createState.publicId,
          createState.rawToken,
        )
      : undefined;

  async function copyLink() {
    if (!shareableLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareableLink);
      setCopiedMessage("הקישור הועתק ללוח.");
    } catch {
      setCopiedMessage("לא ניתן להעתיק אוטומטית. אפשר לסמן ולהעתיק את הקישור.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-slate-50 p-4">
        <h2 className="text-xl font-bold">קישור הזמנה</h2>
        {createState.status === "success" ? (
          <p className="mt-3 text-sm leading-6 text-slate-700">
            הקישור החדש פעיל. לאחר ההעתקה יש לרענן את העמוד כדי לטעון את המטא־נתונים העדכניים.
          </p>
        ) : revokeState.status === "success" ? (
          <p className="mt-3 text-sm leading-6 text-slate-700">
            הקישור בוטל. יש לרענן את העמוד לפני יצירת קישור חדש.
          </p>
        ) : invite ? (
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-slate-600">מצב</dt>
              <dd className="mt-1 text-slate-950">
                {inviteEffectiveStatus === "revoked"
                  ? "בוטל"
                  : inviteEffectiveStatus === "expired"
                    ? "פג תוקף"
                    : "פעיל עד מועד התפוגה"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-600">תוקף</dt>
              <dd className="mt-1 text-slate-950">
                <time dateTime={invite.expiresAt}>
                  {formatMembershipDate(invite.expiresAt)}
                </time>
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-600">
            עדיין לא נוצר קישור. הקישור הראשון יפתח את הליגה להצטרפות למשך שבעה ימים.
          </p>
        )}
      </div>

      {createState.message ? (
        <FormMessage kind={createState.status === "success" ? "success" : "error"}>
          {createState.message}
        </FormMessage>
      ) : null}

      {revokeState.status !== "success" &&
      createState.rawToken &&
      shareableLink ? (
        <section
          aria-labelledby="one-time-invite-title"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-4"
        >
          <h3 id="one-time-invite-title" className="font-bold text-emerald-950">
            קישור חד־פעמי להצגה
          </h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900">
            יש להעתיק עכשיו. מטעמי אבטחה הקישור הגולמי אינו נשמר ולא יוצג לאחר רענון.
          </p>
          <label htmlFor="new-invite-link" className="mt-3 block text-sm font-semibold text-emerald-950">
            הקישור החדש
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="new-invite-link"
              value={shareableLink}
              readOnly
              dir="ltr"
              className="min-w-0 flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-left text-sm outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <button
              type="button"
              onClick={copyLink}
              className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
            >
              העתקת הקישור
            </button>
          </div>
          <p className="mt-2 text-sm text-emerald-900" aria-live="polite">
            {copiedMessage}
          </p>
        </section>
      ) : null}

      {!actionSucceeded ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {inviteActive ? (
            <details className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <summary className="cursor-pointer rounded font-semibold text-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
                החלפת הקישור הפעיל
              </summary>
              <p className="mt-3 max-w-sm text-sm leading-6 text-blue-950">
                יצירת קישור חדש תבטל מיד את הקישור הפעיל הנוכחי.
              </p>
              <form
                action={createAction}
                onSubmit={() => setCopiedMessage(undefined)}
                className="mt-3"
              >
                <input type="hidden" name="leagueId" value={leagueId} />
                <button
                  type="submit"
                  disabled={createPending}
                  className="w-full rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                >
                  {createPending ? "יוצרים קישור..." : "אישור החלפת הקישור"}
                </button>
              </form>
            </details>
          ) : (
            <form
              action={createAction}
              onSubmit={() => setCopiedMessage(undefined)}
            >
              <input type="hidden" name="leagueId" value={leagueId} />
              <button
                type="submit"
                disabled={createPending}
                className="w-full rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
              >
                {createPending ? "יוצרים קישור..." : "יצירת קישור חדש"}
              </button>
            </form>
          )}

          {inviteActive && invite ? (
            <details className="rounded-lg border border-red-200 bg-red-50 p-3">
              <summary className="cursor-pointer rounded font-semibold text-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
                ביטול הקישור
              </summary>
              <p className="mt-3 max-w-sm text-sm leading-6 text-red-950">
                הביטול יחסום מיד בקשות חדשות דרך הקישור הזה.
              </p>
              <form
                action={revokeAction}
                className="mt-3"
              >
                <input type="hidden" name="leagueId" value={leagueId} />
                <input type="hidden" name="inviteId" value={invite.id} />
                <button
                  type="submit"
                  disabled={revokePending}
                  className="w-full rounded-lg bg-red-700 px-4 py-2.5 font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                >
                  {revokePending ? "מבטלים..." : "אישור ביטול הקישור"}
                </button>
              </form>
            </details>
          ) : null}
        </div>
      ) : null}

      {revokeState.message ? (
        <FormMessage kind={revokeState.status === "success" ? "success" : "error"}>
          {revokeState.message}
        </FormMessage>
      ) : null}
    </div>
  );
}
