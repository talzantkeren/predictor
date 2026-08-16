import { INVITE_PUBLIC_ID_PATTERN } from "@/features/membership/invite-token";

const AUTH_REDIRECT_PATHS = new Set([
  "/dashboard",
  "/profile",
  "/update-password",
  "/leagues/new",
]);

// Exactly one protected league-summary path: a UUID segment with no query
// string, fragment, backslash, or nested segment. Anything else falls back.
const LEAGUE_SUMMARY_PATH_PATTERN =
  /^\/leagues\/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
const LEAGUE_SETTINGS_PATH_PATTERN =
  /^\/leagues\/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\/settings$/;
const LEAGUE_MATCHES_PATH_PATTERN =
  /^\/leagues\/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\/matches$/;
const MATCH_DETAIL_PATH_PATTERN =
  /^\/matches\/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
const INVITE_PATH_PATTERN = new RegExp(
  `^/invite/${INVITE_PUBLIC_ID_PATTERN.source.slice(1, -1)}$`,
);

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
    LEAGUE_SUMMARY_PATH_PATTERN.test(candidate) ||
    LEAGUE_SETTINGS_PATH_PATTERN.test(candidate) ||
    LEAGUE_MATCHES_PATH_PATTERN.test(candidate) ||
    MATCH_DETAIL_PATH_PATTERN.test(candidate) ||
    INVITE_PATH_PATTERN.test(candidate)
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
