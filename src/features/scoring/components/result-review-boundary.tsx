import "server-only";

import { ResultReviewForm } from "@/features/scoring/components/result-review-form";
import type { LifecycleDecisionActionState } from "@/features/scoring/lifecycle-decision-action-state";
import { mutateResultReview } from "@/features/scoring/result-review-mutation";

export function ResultReviewBoundary({
  matchId,
  resultVersion,
}: {
  matchId: string;
  resultVersion: number;
}) {
  async function resolveReview(
    previousState: LifecycleDecisionActionState,
    formData: FormData,
  ) {
    "use server";
    return mutateResultReview(
      { matchId, resultVersion },
      previousState,
      formData,
    );
  }

  return <ResultReviewForm action={resolveReview} matchId={matchId} />;
}
