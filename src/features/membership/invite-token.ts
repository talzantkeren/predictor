export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isValidInviteToken(value: unknown): value is string {
  return typeof value === "string" && INVITE_TOKEN_PATTERN.test(value);
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
