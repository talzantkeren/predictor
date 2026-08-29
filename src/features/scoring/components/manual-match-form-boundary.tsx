import "server-only";

import { ManualMatchForm } from "@/features/scoring/components/manual-match-form";
import type { ManualMatchActionState } from "@/features/scoring/manual-match-action-state";
import { mutateManualMatch } from "@/features/scoring/manual-match-mutation";
import type {
  SystemMatchEditorCatalog,
  SystemMatchItem,
} from "@/features/scoring/types";

type ManualMatchFormBoundaryProps = {
  catalog: SystemMatchEditorCatalog;
  createMatchId?: string;
  match?: SystemMatchItem;
};

export function ManualMatchFormBoundary({
  catalog,
  createMatchId,
  match,
}: ManualMatchFormBoundaryProps) {
  const operation = match ? "correct" : "create";
  const matchId = match?.id ?? createMatchId;
  if (!matchId) {
    throw new Error("A server-issued match ID is required for Manual create.");
  }
  const trustedMatchId = matchId;

  async function submitManualMatch(
    previousState: ManualMatchActionState,
    formData: FormData,
  ) {
    "use server";

    return mutateManualMatch(
      { operation, matchId: trustedMatchId },
      previousState,
      formData,
    );
  }

  return (
    <ManualMatchForm
      action={submitManualMatch}
      catalog={catalog}
      match={match}
      observedMatchId={trustedMatchId}
    />
  );
}
