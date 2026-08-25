import { ProofUploadForm } from "@/features/files/components/proof-upload-form";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatMembershipDate,
  getJoinRequestStatusLabel,
} from "@/features/membership/display";
import type { JoinRequestDashboardItem } from "@/features/membership/types";

import { ProofHistory } from "./proof-history";

export function JoinRequestCard({ request }: { request: JoinRequestDashboardItem }) {
  const canUpload =
    request.status === "pending_proof" || request.status === "pending_approval";

  return (
    <article className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="break-words text-lg font-extrabold text-ink">
            {request.leagueName}
          </h3>
          <p className="mt-1 text-sm text-ink-muted">
            נפתחה ב־
            <time dateTime={request.createdAt}>
              {formatMembershipDate(request.createdAt)}
            </time>
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            עודכנה לאחרונה ב־
            <time dateTime={request.updatedAt}>
              {formatMembershipDate(request.updatedAt)}
            </time>
          </p>
        </div>
        <StatusBadge
          tone={
            request.status === "approved"
              ? "success"
              : request.status === "rejected"
                ? "error"
                : "warning"
          }
        >
          {getJoinRequestStatusLabel(request.status)}
        </StatusBadge>
      </div>

      <div className="mt-4 rounded-xl bg-surface-subtle p-4 text-sm leading-6 text-ink-secondary">
        {request.status === "pending_proof"
          ? "השלב הבא: העלאת תמונת Demo סינתטית בלבד."
          : request.status === "pending_approval"
            ? "התמונה ממתינה לבדיקה ידנית של מנהל/ת הליגה. אפשר להעלות תמונת Demo חלופית כל עוד לא התקבלה החלטה."
            : request.status === "approved"
              ? "הבקשה אושרה. הליגה תופיע ברשימת הליגות הפעילות."
              : "הבקשה הסתיימה. בקשה חדשה אפשר לפתוח רק דרך קישור הזמנה פעיל."}
      </div>

      {request.status === "rejected" && request.rejectionReason ? (
        <p className="mt-3 rounded-xl border border-error-200 bg-error-50 p-3 text-sm leading-6 text-error-900">
          <span className="font-bold">סיבת הדחייה: </span>
          {request.rejectionReason}
        </p>
      ) : null}

      {request.proofs.length > 0 ? (
        <div className="mt-5">
          <ProofHistory proofs={request.proofs} />
        </div>
      ) : null}

      {canUpload ? (
        <div className="mt-5 border-t border-line pt-5">
          <ProofUploadForm
            requestId={request.requestId}
            proofCount={request.proofs.length}
          />
        </div>
      ) : null}
    </article>
  );
}
