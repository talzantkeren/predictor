const AUTH_REDIRECT_PATHS = new Set([
  "/dashboard",
  "/profile",
  "/update-password",
]);

export function getSafeAuthRedirect(
  candidate: unknown,
  fallback = "/dashboard",
) {
  if (
    typeof candidate !== "string" ||
    candidate.includes("\\") ||
    candidate.startsWith("//") ||
    !candidate.startsWith("/") ||
    !AUTH_REDIRECT_PATHS.has(candidate)
  ) {
    return fallback;
  }

  return candidate;
}
