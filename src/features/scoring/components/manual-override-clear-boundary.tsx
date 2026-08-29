import "server-only";

import { ManualOverrideClearForm } from "@/features/scoring/components/manual-override-clear-form";
import type { ManualOverrideClearActionState } from "@/features/scoring/manual-override-clear-action-state";
import { mutateManualOverrideClear } from "@/features/scoring/manual-override-clear-mutation";
import type { SystemMatchItem } from "@/features/scoring/types";

export function ManualOverrideClearBoundary({
  match,
}: {
  match: SystemMatchItem;
}) {
  const trustedMatchId = match.id;

  async function clearManualOverride(
    previousState: ManualOverrideClearActionState,
    formData: FormData,
  ) {
    "use server";

    return mutateManualOverrideClear(
      { matchId: trustedMatchId },
      previousState,
      formData,
    );
  }

  return (
    <ManualOverrideClearForm
      action={clearManualOverride}
      externalProvider={match.externalProvider}
      isManuallyOverridden={match.isManuallyOverridden}
      observedMatchId={trustedMatchId}
    />
  );
}
