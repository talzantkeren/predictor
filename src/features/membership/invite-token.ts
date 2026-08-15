export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const INVITE_TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;
export const INVITE_PUBLIC_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isValidInviteToken(value: unknown): value is string {
  return typeof value === "string" && INVITE_TOKEN_PATTERN.test(value);
}

export function isValidInviteTokenHash(value: unknown): value is string {
  return typeof value === "string" && INVITE_TOKEN_HASH_PATTERN.test(value);
}

export function isValidInvitePublicId(value: unknown): value is string {
  return typeof value === "string" && INVITE_PUBLIC_ID_PATTERN.test(value);
}

export async function hashInviteToken(token: string) {
  if (!isValidInviteToken(token)) {
    throw new Error("INVALID_INVITE_TOKEN");
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
