import {
  isValidInvitePublicId,
  isValidInviteToken,
} from "@/features/membership/invite-token";

export const INVITE_SECRET_FRAGMENT_KEY = "invite";

export function getInvitePath(publicId: string) {
  if (!isValidInvitePublicId(publicId)) {
    throw new Error("INVALID_INVITE_PUBLIC_ID");
  }

  return `/invite/${publicId}`;
}

export function parseInviteSecretFragment(fragment: unknown) {
  if (typeof fragment !== "string") {
    return null;
  }

  const match = fragment.match(/^#invite=([A-Za-z0-9_-]{43})$/);
  return match && isValidInviteToken(match[1]) ? match[1] : null;
}

export function buildInviteShareUrl(
  applicationOrigin: string,
  publicId: string,
  rawToken: string,
) {
  if (!isValidInviteToken(rawToken)) {
    throw new Error("INVALID_INVITE_TOKEN");
  }

  const url = new URL(getInvitePath(publicId), applicationOrigin);
  url.hash = `${INVITE_SECRET_FRAGMENT_KEY}=${rawToken}`;
  return url.toString();
}
