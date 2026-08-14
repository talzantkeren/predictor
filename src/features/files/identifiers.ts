import { z } from "zod";

import { ProofError } from "@/features/files/errors";

const uuidSchema = z.string().uuid();

export function parseUuid(value: unknown) {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data.toLowerCase() : undefined;
}

export function requireUuid(
  value: unknown,
  code: "INVALID_REQUEST_ID" | "INVALID_PROOF_ID",
) {
  const parsed = parseUuid(value);

  if (!parsed) {
    throw new ProofError(code, 400);
  }

  return parsed;
}
