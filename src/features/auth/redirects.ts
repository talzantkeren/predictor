const AUTH_REDIRECT_PATHS = new Set([
  "/dashboard",
  "/profile",
  "/update-password",
  "/leagues/new",
]);

// Exactly one protected league-summary path: a UUID segment with no query
// string, fragment, backslash, or nested segment. Anything else falls back.
const LEAGUE_SUMMARY_PATH_PATTERN =
  /^\/leagues\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getSafeAuthRedirect(
  candidate: unknown,
  fallback = "/dashboard",
) {
  if (
    typeof candidate !== "string" ||
    candidate.includes("\\") ||
    candidate.startsWith("//") ||
    !candidate.startsWith("/")
  ) {
    return fallback;
  }

  if (
    AUTH_REDIRECT_PATHS.has(candidate) ||
    LEAGUE_SUMMARY_PATH_PATTERN.test(candidate)
  ) {
    return candidate;
  }

  return fallback;
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
