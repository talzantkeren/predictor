import { ProofError } from "@/features/files/errors";

export function assertDemoMode(demoMode: boolean) {
  if (!demoMode) {
    throw new ProofError("DEMO_MODE_REQUIRED", 403);
  }
}

export function assertTrustedSameOrigin(
  requestOrigin: string | null,
  trustedApplicationUrl: string,
  trustedDeploymentHosts: readonly (string | undefined)[] = [],
) {
  let trustedOrigin: string;

  try {
    trustedOrigin = new URL(trustedApplicationUrl).origin;
  } catch (error) {
    throw new ProofError("INTERNAL_ERROR", 500, { cause: error });
  }

  const allowedOrigins = new Set([trustedOrigin]);

  for (const host of trustedDeploymentHosts) {
    if (!host || host.includes("\\")) {
      continue;
    }

    try {
      const deploymentUrl = new URL(
        host.includes("://") ? host : `https://${host}`,
      );

      if (deploymentUrl.protocol === "https:") {
        allowedOrigins.add(deploymentUrl.origin);
      }
    } catch {
      // Ignore malformed platform-provided values and fail closed below.
    }
  }

  if (requestOrigin === null || !allowedOrigins.has(requestOrigin)) {
    throw new ProofError("INVALID_ORIGIN", 403);
  }
}
