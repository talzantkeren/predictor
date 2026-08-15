import "server-only";

import { cookies } from "next/headers";

import {
  INVITE_ACCESS_COOKIE,
  parseInviteAccessCookie,
} from "@/features/membership/invite-access";

export async function getInviteAccessTokenHash(publicId: string) {
  const cookieStore = await cookies();
  const matchingHashes = cookieStore
    .getAll(INVITE_ACCESS_COOKIE)
    .map(({ value }) => parseInviteAccessCookie(value, publicId))
    .filter((value): value is string => value !== null);

  return matchingHashes.length === 1 ? matchingHashes[0] : null;
}
