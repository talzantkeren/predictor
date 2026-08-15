import { getInvitePath } from "@/features/membership/invite-fragment";
import {
  isValidInvitePublicId,
  isValidInviteTokenHash,
} from "@/features/membership/invite-token";

export const INVITE_ACCESS_COOKIE = "predictor_invite_access";
export const INVITE_ACCESS_MAX_AGE_SECONDS = 30 * 60;
export const MAX_INVITE_EXCHANGE_BODY_BYTES = 256;

export function encodeInviteAccessCookie(publicId: string, tokenHash: string) {
  if (!isValidInvitePublicId(publicId) || !isValidInviteTokenHash(tokenHash)) {
    throw new Error("INVALID_INVITE_ACCESS");
  }

  return `${publicId}.${tokenHash}`;
}

export function parseInviteAccessCookie(
  value: unknown,
  expectedPublicId: string,
) {
  if (
    typeof value !== "string" ||
    !isValidInvitePublicId(expectedPublicId)
  ) {
    return null;
  }

  const separator = value.indexOf(".");
  if (separator === -1 || value.indexOf(".", separator + 1) !== -1) {
    return null;
  }

  const publicId = value.slice(0, separator);
  const tokenHash = value.slice(separator + 1);

  return publicId === expectedPublicId && isValidInviteTokenHash(tokenHash)
    ? tokenHash
    : null;
}

export function getInviteAccessCookieOptions(publicId: string, maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: getInvitePath(publicId),
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

function normalizeTrustedOrigin(candidate: unknown) {
  if (typeof candidate !== "string" || candidate.includes("\\")) {
    return undefined;
  }

  try {
    const url = new URL(
      candidate.includes("://") ? candidate : `https://${candidate}`,
    );
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

export function isTrustedInviteExchangeOrigin(
  requestOrigin: unknown,
  applicationUrl: string,
  deploymentHosts: readonly (string | undefined)[] = [],
) {
  const applicationOrigin = normalizeTrustedOrigin(applicationUrl);
  const normalizedRequestOrigin = normalizeTrustedOrigin(requestOrigin);

  if (!applicationOrigin || !normalizedRequestOrigin) {
    return false;
  }

  const allowedOrigins = new Set([applicationOrigin]);

  for (const host of deploymentHosts) {
    const origin = normalizeTrustedOrigin(host);
    if (origin?.startsWith("https://")) {
      allowedOrigins.add(origin);
    }
  }

  return allowedOrigins.has(normalizedRequestOrigin);
}
