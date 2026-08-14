import {
  MAX_PROOF_REQUEST_BYTES,
  MAX_PROOF_FILE_BYTES,
} from "@/features/files/constants";
import { ProofError } from "@/features/files/errors";
import { parseUuid } from "@/features/files/identifiers";

export type ParsedProofUploadForm = {
  file: File;
  idempotencyKey: string;
};

function parseContentLength(value: string | null) {
  if (value === null) {
    return undefined;
  }

  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new ProofError("INVALID_CONTENT_LENGTH", 400);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new ProofError("INVALID_CONTENT_LENGTH", 400);
  }

  return parsed;
}

export function assertProofRequestSizeHeaders(
  request: Request,
  maximumBytes = MAX_PROOF_REQUEST_BYTES,
) {
  const contentLength = parseContentLength(request.headers.get("content-length"));

  if (contentLength !== undefined && contentLength > maximumBytes) {
    throw new ProofError("REQUEST_TOO_LARGE", 413);
  }
}

export async function readBoundedRequestBody(
  request: Request,
  maximumBytes = MAX_PROOF_REQUEST_BYTES,
) {
  assertProofRequestSizeHeaders(request, maximumBytes);

  if (!request.body) {
    return Buffer.alloc(0);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ProofError("REQUEST_TOO_LARGE", 413);
      }

      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ProofError) {
      throw error;
    }

    throw new ProofError("INVALID_MULTIPART", 400, { cause: error });
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

export async function parseProofMultipartForm(
  request: Request,
  body: Uint8Array,
): Promise<ParsedProofUploadForm> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new ProofError("INVALID_MULTIPART", 415);
  }

  let formData: FormData;

  try {
    const parseRequest = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: Buffer.from(body),
    });
    formData = await parseRequest.formData();
  } catch (error) {
    throw new ProofError("INVALID_MULTIPART", 400, { cause: error });
  }

  const allowedFields = new Set(["proof", "idempotencyKey"]);

  for (const key of formData.keys()) {
    if (!allowedFields.has(key)) {
      throw new ProofError("UNEXPECTED_FORM_FIELD", 400);
    }
  }

  const files = formData.getAll("proof");

  if (files.length === 0) {
    throw new ProofError("MISSING_FILE", 400);
  }

  if (files.length > 1) {
    throw new ProofError("DUPLICATE_FILE", 400);
  }

  const [file] = files;

  if (!(file instanceof File)) {
    throw new ProofError("MISSING_FILE", 400);
  }

  if (file.size === 0) {
    throw new ProofError("EMPTY_FILE", 400);
  }

  if (file.size > MAX_PROOF_FILE_BYTES) {
    throw new ProofError("FILE_TOO_LARGE", 413);
  }

  const idempotencyKeys = formData.getAll("idempotencyKey");

  if (idempotencyKeys.length === 0) {
    throw new ProofError("MISSING_IDEMPOTENCY_KEY", 400);
  }

  if (idempotencyKeys.length > 1) {
    throw new ProofError("DUPLICATE_IDEMPOTENCY_KEY", 400);
  }

  const idempotencyKey = parseUuid(idempotencyKeys[0]);

  if (!idempotencyKey) {
    throw new ProofError("INVALID_IDEMPOTENCY_KEY", 400);
  }

  return { file, idempotencyKey };
}
