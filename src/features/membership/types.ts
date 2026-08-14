export type JoinRequestStatus =
  | "pending_proof"
  | "pending_approval"
  | "approved"
  | "rejected";

export type InviteViewerState =
  | "guest"
  | "eligible"
  | "manager"
  | "active_member"
  | "pending_proof"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "closed";

export type ProofSummary = {
  id: string;
  mimeType: "image/webp";
  sizeBytes: number;
  uploadedAt: string;
};

export type InviteMetadata = {
  id: string;
  status: "active" | "revoked";
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  isExpired: boolean;
};

export type InviteResolution = {
  available: true;
  leagueName: string;
  demoEntryFeeAgorot: number;
  demoPaymentInstructions: string | null;
  joinsCloseAt: string | null;
  viewerState: InviteViewerState;
  joinRequestId: string | null;
  joinRequestStatus: JoinRequestStatus | null;
  requestCreatedAt: string | null;
  requestUpdatedAt: string | null;
  proofs: ProofSummary[];
};

export type JoinRequestDashboardItem = {
  requestId: string;
  leagueName: string;
  status: JoinRequestStatus;
  createdAt: string;
  updatedAt: string;
  proofs: ProofSummary[];
};

export type LeagueInviteSettings = {
  id: string;
  name: string;
  status: "draft" | "open" | "active" | "completed" | "archived";
};
