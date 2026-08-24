import {
  formatMembershipDate,
  formatProofSize,
} from "@/features/membership/display";
import type { ProofSummary } from "@/features/membership/types";

export function ProofHistory({ proofs }: { proofs: ProofSummary[] }) {
  if (proofs.length === 0) {
    return <p className="text-sm text-ink-muted">עדיין לא נשמרה תמונת Demo.</p>;
  }

  return (
    <div>
      <h3 className="font-extrabold text-ink">היסטוריית תמונות Demo</h3>
      <p className="mt-1 text-sm leading-6 text-ink-muted">
        כל העלאה נשמרת כרשומה נפרדת. התמונה הראשונה ברשימה היא הנוכחית.
      </p>
      <ol className="mt-3 space-y-2">
        {proofs.map((proof, index) => (
          <li
            key={proof.id}
            className="flex flex-col gap-2 rounded-xl border border-line bg-surface-subtle p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-bold text-ink">
                {index === 0 ? "תמונת Demo נוכחית" : `תמונה קודמת ${index}`}
              </p>
              <p className="mt-1 text-sm text-ink-secondary">
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
              className="inline-flex min-h-11 items-center self-start rounded-lg border border-line px-3 py-2 text-sm font-bold text-navy-700 transition hover:bg-white sm:self-auto"
            >
              צפייה בתמונת Demo
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
