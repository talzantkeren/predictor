"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";

import { IsolatedText } from "@/components/ui/isolated-text";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  FieldError,
  FormMessage,
} from "@/features/auth/components/form-message";
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

function getRequestTone(status: ManagerJoinRequestItem["status"]) {
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "error" as const;
  if (status === "pending_approval") return "warning" as const;
  return "info" as const;
}

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
  const rejectionReasonRef = useRef<HTMLTextAreaElement>(null);
  const reasonHelpId = `reason-help-${request.requestId}`;
  const reasonErrorId = `reason-error-${request.requestId}`;
  const reasonErrors = rejectState.fieldErrors?.reason;
  const hasReasonError = Boolean(reasonErrors?.length);

  useEffect(() => {
    if (approveState.status === "success" || rejectState.status === "success") {
      router.refresh();
    }
  }, [approveState.status, rejectState.status, router]);

  useEffect(() => {
    if (hasReasonError) {
      rejectionReasonRef.current?.focus();
    }
  }, [hasReasonError, reasonErrors]);

  const isPending = request.status === "pending_approval";

  return (
    <article className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="break-words text-lg font-black text-ink">
            <IsolatedText>{request.requesterDisplayName}</IsolatedText>
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            נפתחה ב־
            <time dateTime={request.createdAt}>
              {formatMembershipDate(request.createdAt)}
            </time>
          </p>
        </div>
        <StatusBadge tone={getRequestTone(request.status)}>
          {getJoinRequestStatusLabel(request.status)}
        </StatusBadge>
      </div>

      <div className="mt-5">
        {request.proofs.length > 0 ? (
          <ProofHistory proofs={request.proofs} />
        ) : (
          <p className="rounded-xl bg-surface-subtle p-3 text-sm text-ink-secondary">
            טרם הועלתה תמונת Demo. אפשר להכריע רק בקשה שממתינה לאישור.
          </p>
        )}
      </div>

      {request.status === "rejected" && request.rejectionReason ? (
        <p className="mt-4 rounded-xl border border-error-200 bg-error-50 p-3 text-sm leading-6 text-error-900">
          <span className="font-extrabold">סיבת הדחייה: </span>
          <IsolatedText>{request.rejectionReason}</IsolatedText>
        </p>
      ) : null}

      {isPending ? (
        <div className="mt-5 grid gap-4 border-t border-line pt-5 lg:grid-cols-2">
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
              className="min-h-11 w-full rounded-lg bg-action px-4 py-2.5 font-extrabold text-white hover:bg-action-hover disabled:cursor-wait disabled:opacity-60"
            >
              {approving ? "מאשרים..." : "אישור וצירוף לליגה"}
            </button>
          </form>

          <form action={rejectAction} className="space-y-3">
            <input type="hidden" name="leagueId" value={leagueId} />
            <input type="hidden" name="requestId" value={request.requestId} />
            <label htmlFor={`reason-${request.requestId}`} className="block text-sm font-bold text-ink">
              סיבת דחייה
            </label>
            <textarea
              ref={rejectionReasonRef}
              id={`reason-${request.requestId}`}
              name="reason"
              required
              minLength={3}
              maxLength={300}
              rows={3}
              aria-invalid={hasReasonError}
              aria-describedby={`${reasonHelpId}${hasReasonError ? ` ${reasonErrorId}` : ""}`}
              aria-errormessage={hasReasonError ? reasonErrorId : undefined}
              className="w-full rounded-lg border border-control-border bg-white px-3 py-2 text-ink outline-none focus:border-focus focus:ring-2 focus:ring-navy-200"
            />
            <p id={reasonHelpId} className="text-xs leading-5 text-ink-muted">
              הסיבה תוצג למבקש/ת. אין לכלול מידע רגיש.
            </p>
            <FieldError id={reasonErrorId} messages={reasonErrors} />
            {rejectState.message ? (
              <FormMessage kind={rejectState.status === "success" ? "success" : "error"}>
                {rejectState.message}
              </FormMessage>
            ) : null}
            <button
              type="submit"
              disabled={approving || rejecting}
              className="min-h-11 w-full rounded-lg border border-error-200 px-4 py-2.5 font-extrabold text-error-900 hover:bg-error-50 disabled:cursor-wait disabled:opacity-60"
            >
              {rejecting ? "דוחים..." : "דחיית הבקשה"}
            </button>
          </form>
        </div>
      ) : null}
    </article>
  );
}
