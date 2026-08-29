import { beforeEach, describe, expect, it, vi } from "vitest";

const actorId = "70000000-0000-4000-8000-000000000007";
const mocks = vi.hoisted(() => ({
  getSportsSyncEnv: vi.fn(),
  getSystemAdminAuthorization: vi.fn(),
  requireAuthenticatedUser: vi.fn(),
  revalidatePath: vi.fn(),
  runSportsSync: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/features/auth/session", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
}));
vi.mock("@/features/scoring/queries", () => ({
  getSystemAdminAuthorization: mocks.getSystemAdminAuthorization,
}));
vi.mock("@/features/sync/orchestrator", () => ({
  runSportsSync: mocks.runSportsSync,
}));
vi.mock("@/lib/env", () => ({ getSportsSyncEnv: mocks.getSportsSyncEnv }));

import { triggerSportsSyncAction } from "@/features/sync/actions";

describe("sports sync trigger action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: { boundary: "recorded-session-client" },
      user: { id: actorId },
    });
    mocks.getSystemAdminAuthorization.mockResolvedValue({ status: "authorized" });
    mocks.getSportsSyncEnv.mockReturnValue({
      SPORTS_API_PROVIDER: "api-football",
      SPORTS_API_KEY: "recorded-test-key",
    });
  });

  it("returns neutral cooldown copy without presenting the valid skip as a failure", async () => {
    mocks.runSportsSync.mockResolvedValue({
      runId: null,
      status: "skipped",
      reason: "FORCE_COOLDOWN",
    });

    await expect(triggerSportsSyncAction({ status: "idle" })).resolves.toEqual({
      status: "skipped",
      message: "ניתן להפעיל סנכרון ידני פעם בדקה; יש להמתין לפני ניסיון נוסף",
    });
    expect(mocks.runSportsSync).toHaveBeenCalledWith({
      systemActorId: actorId,
      provider: "api-football",
      apiKey: "recorded-test-key",
      force: true,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/sync");
  });
});
