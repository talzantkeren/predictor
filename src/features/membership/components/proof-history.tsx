import {
  formatMembershipDate,
  formatProofSize,
} from "@/features/membership/display";
import type { ProofSummary } from "@/features/membership/types";

export function ProofHistory({ proofs }: { proofs: ProofSummary[] }) {
  if (proofs.length === 0) {
    return <p className="text-sm text-slate-500">עדיין לא נשמרה תמונת Demo.</p>;
  }

  return (
    <div>
      <h3 className="font-bold text-slate-900">היסטוריית תמונות Demo</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        כל העלאה נשמרת כרשומה נפרדת. התמונה הראשונה ברשימה היא הנוכחית.
      </p>
      <ol className="mt-3 space-y-2">
        {proofs.map((proof, index) => (
          <li
            key={proof.id}
            className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-semibold text-slate-900">
                {index === 0 ? "תמונת Demo נוכחית" : `תמונה קודמת ${index}`}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                <time dateTime={proof.uploadedAt}>
                  {formatMembershipDate(proof.uploadedAt)}
                </time>{" "}
                · {formatProofSize(proof.sizeBytes)}
              </p>
            </div>
            <a
              href={`/api/payment-proofs/${proof.id}`}
              target="_blank"
              rel="noreferrer"
              className="self-start rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:self-auto"
            >
              צפייה בתמונת Demo
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
