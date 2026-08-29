import "server-only";

import { CompletedReconciliationForm } from "@/features/scoring/components/completed-reconciliation-form";
import { mutateCompletedReconciliation } from "@/features/scoring/completed-reconciliation-mutation";
import type { LifecycleDecisionActionState } from "@/features/scoring/lifecycle-decision-action-state";

export function CompletedReconciliationBoundary({
  reconciliationId,
  expectedResultVersion,
}: {
  reconciliationId: string;
  expectedResultVersion: number;
}) {
  async function decideReconciliation(
    previousState: LifecycleDecisionActionState,
    formData: FormData,
  ) {
    "use server";
    return mutateCompletedReconciliation(
      { reconciliationId, expectedResultVersion },
      previousState,
      formData,
    );
  }

  return <CompletedReconciliationForm action={decideReconciliation} />;
}
