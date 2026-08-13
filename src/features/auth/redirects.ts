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

function normalizeOrigin(candidate: unknown) {
  if (typeof candidate !== "string" || candidate.includes("\\")) {
    return undefined;
  }

  try {
    return new URL(
      candidate.includes("://") ? candidate : `https://${candidate}`,
    ).origin;
  } catch {
    return undefined;
  }
}

export function getSafeAuthOrigin(
  candidate: unknown,
  allowedOrigins: Iterable<string>,
  fallback: string,
) {
  const safeFallback = normalizeOrigin(fallback);

  if (!safeFallback) {
    throw new Error("Auth origin fallback must be a valid URL.");
  }

  const normalizedCandidate = normalizeOrigin(candidate);
  const normalizedAllowedOrigins = new Set(
    [...allowedOrigins]
      .map((origin) => normalizeOrigin(origin))
      .filter((origin): origin is string => Boolean(origin)),
  );

  return normalizedCandidate && normalizedAllowedOrigins.has(normalizedCandidate)
    ? normalizedCandidate
    : safeFallback;
}
