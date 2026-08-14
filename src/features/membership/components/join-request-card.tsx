import { ProofUploadForm } from "@/features/files/components/proof-upload-form";
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
    <article className="rounded-xl border border-slate-200 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="break-words text-lg font-bold text-slate-950">
            {request.leagueName}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            נפתחה ב־
            <time dateTime={request.createdAt}>
              {formatMembershipDate(request.createdAt)}
            </time>
          </p>
          <p className="mt-1 text-sm text-slate-500">
            עודכנה לאחרונה ב־
            <time dateTime={request.updatedAt}>
              {formatMembershipDate(request.updatedAt)}
            </time>
          </p>
        </div>
        <span className="self-start rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-900">
          {getJoinRequestStatusLabel(request.status)}
        </span>
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
        {request.status === "pending_proof"
          ? "השלב הבא: העלאת תמונת Demo סינתטית בלבד."
          : request.status === "pending_approval"
            ? "התמונה ממתינה לבדיקה ידנית של מנהל/ת הליגה. אפשר להעלות תמונת Demo חלופית כל עוד לא התקבלה החלטה."
            : request.status === "approved"
              ? "הבקשה אושרה. הליגה תופיע ברשימת הליגות הפעילות."
              : "הבקשה הסתיימה. בקשה חדשה אפשר לפתוח רק דרך קישור הזמנה פעיל."}
      </div>

      {request.proofs.length > 0 ? (
        <div className="mt-5">
          <ProofHistory proofs={request.proofs} />
        </div>
      ) : null}

      {canUpload ? (
        <div className="mt-5 border-t border-slate-200 pt-5">
          <ProofUploadForm
            requestId={request.requestId}
            proofCount={request.proofs.length}
          />
        </div>
      ) : null}
    </article>
  );
}
