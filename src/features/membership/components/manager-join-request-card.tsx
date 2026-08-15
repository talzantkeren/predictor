"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { FormMessage } from "@/features/auth/components/form-message";
import {
  approveJoinRequestAction,
  type JoinDecisionActionState,
  rejectJoinRequestAction,
} from "@/features/membership/actions";
import {
  formatMembershipDate,
  getJoinRequestStatusLabel,
} from "@/features/membership/display";
import type { ManagerJoinRequestItem } from "@/features/membership/types";

import { ProofHistory } from "./proof-history";

const initialState: JoinDecisionActionState = { status: "idle" };

export function ManagerJoinRequestCard({
  leagueId,
  request,
}: {
  leagueId: string;
  request: ManagerJoinRequestItem;
}) {
  const router = useRouter();
  const [approveState, approveAction, approving] = useActionState(
    approveJoinRequestAction,
    initialState,
  );
  const [rejectState, rejectAction, rejecting] = useActionState(
    rejectJoinRequestAction,
    initialState,
  );

  useEffect(() => {
    if (approveState.status === "success" || rejectState.status === "success") {
      router.refresh();
    }
  }, [approveState.status, rejectState.status, router]);

  const isPending = request.status === "pending_approval";

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="break-words text-lg font-bold text-slate-950">
            {request.requesterDisplayName}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            נפתחה ב־
            <time dateTime={request.createdAt}>
              {formatMembershipDate(request.createdAt)}
            </time>
          </p>
        </div>
        <span className="self-start rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-900">
          {getJoinRequestStatusLabel(request.status)}
        </span>
      </div>

      <div className="mt-5">
        {request.proofs.length > 0 ? (
          <ProofHistory proofs={request.proofs} />
        ) : (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            טרם הועלתה תמונת Demo. אפשר להכריע רק בקשה שממתינה לאישור.
          </p>
        )}
      </div>

      {request.status === "rejected" && request.rejectionReason ? (
        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
          <span className="font-semibold text-slate-900">סיבת הדחייה: </span>
          {request.rejectionReason}
        </p>
      ) : null}

      {isPending ? (
        <div className="mt-5 grid gap-4 border-t border-slate-200 pt-5 lg:grid-cols-2">
          <form action={approveAction} className="space-y-3">
            <input type="hidden" name="leagueId" value={leagueId} />
            <input type="hidden" name="requestId" value={request.requestId} />
            {approveState.message ? (
              <FormMessage kind={approveState.status === "success" ? "success" : "error"}>
                {approveState.message}
              </FormMessage>
            ) : null}
            <button
              type="submit"
              disabled={approving || rejecting}
              className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-60"
            >
              {approving ? "מאשרים..." : "אישור וצירוף לליגה"}
            </button>
          </form>

          <form action={rejectAction} className="space-y-3">
            <input type="hidden" name="leagueId" value={leagueId} />
            <input type="hidden" name="requestId" value={request.requestId} />
            <label htmlFor={`reason-${request.requestId}`} className="block text-sm font-semibold text-slate-800">
              סיבת דחייה
            </label>
            <textarea
              id={`reason-${request.requestId}`}
              name="reason"
              required
              minLength={3}
              maxLength={300}
              rows={3}
              aria-describedby={`reason-help-${request.requestId}`}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <p id={`reason-help-${request.requestId}`} className="text-xs leading-5 text-slate-500">
              הסיבה תוצג למבקש/ת. אין לכלול מידע רגיש.
            </p>
            {rejectState.fieldErrors?.reason?.map((message) => (
              <p key={message} role="alert" className="text-sm text-red-800">
                {message}
              </p>
            ))}
            {rejectState.message ? (
              <FormMessage kind={rejectState.status === "success" ? "success" : "error"}>
                {rejectState.message}
              </FormMessage>
            ) : null}
            <button
              type="submit"
              disabled={approving || rejecting}
              className="w-full rounded-lg border border-red-300 px-4 py-2.5 font-semibold text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-60"
            >
              {rejecting ? "דוחים..." : "דחיית הבקשה"}
            </button>
          </form>
        </div>
      ) : null}
    </article>
  );
}
