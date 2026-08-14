import type {
  InviteMetadata,
  JoinRequestStatus,
} from "@/features/membership/types";

const statusLabels: Record<JoinRequestStatus, string> = {
  pending_proof: "ממתינה לתמונת Demo",
  pending_approval: "ממתינה לבדיקת מנהל/ת הליגה",
  approved: "אושרה",
  rejected: "נדחתה",
};

export function getJoinRequestStatusLabel(status: JoinRequestStatus) {
  return statusLabels[status];
}

export function getInviteEffectiveStatus(
  invite: Pick<InviteMetadata, "status" | "isExpired">,
) {
  if (invite.status === "revoked") {
    return "revoked" as const;
  }

  return invite.isExpired ? ("expired" as const) : ("active" as const);
}

export function isInviteEffectivelyActive(
  invite: Pick<InviteMetadata, "status" | "isExpired">,
) {
  return getInviteEffectiveStatus(invite) === "active";
}

export function formatMembershipDate(value: string) {
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(value));
}

export function formatProofSize(bytes: number) {
  return `${new Intl.NumberFormat("he-IL", {
    maximumFractionDigits: 1,
  }).format(bytes / 1024)} KB`;
}
