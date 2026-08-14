import { createHash } from "node:crypto";
import { extname } from "node:path";

import { fileTypeFromBuffer } from "file-type";
import sharp, { type Metadata, type OutputInfo } from "sharp";

import {
  MAX_PROOF_DIMENSION,
  MAX_PROOF_FILE_BYTES,
  MAX_PROOF_INPUT_PIXELS,
  SANITIZED_PROOF_MIME_TYPE,
} from "@/features/files/constants";
import { ProofError } from "@/features/files/errors";

const acceptedImageTypes = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
} as const;

type AcceptedMimeType = keyof typeof acceptedImageTypes;

export type SanitizedProofImage = {
  bytes: Buffer;
  mimeType: typeof SANITIZED_PROOF_MIME_TYPE;
  sha256: string;
  sizeBytes: number;
  width: number;
  height: number;
};

export async function assertSanitizedProofForStorage(
  image: SanitizedProofImage,
) {
  if (
    !Buffer.isBuffer(image.bytes) ||
    image.mimeType !== SANITIZED_PROOF_MIME_TYPE ||
    !Number.isInteger(image.sizeBytes) ||
    image.sizeBytes !== image.bytes.byteLength ||
    image.sizeBytes < 1 ||
    image.sizeBytes > MAX_PROOF_FILE_BYTES ||
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    image.width > MAX_PROOF_DIMENSION ||
    image.height > MAX_PROOF_DIMENSION ||
    !/^[0-9a-f]{64}$/.test(image.sha256)
  ) {
    throw new ProofError("INTERNAL_ERROR", 500);
  }

  const detected = await fileTypeFromBuffer(image.bytes);
  const digest = createHash("sha256").update(image.bytes).digest("hex");

  let metadata: Metadata;

  try {
    metadata = await sharp(image.bytes, {
      animated: true,
      failOn: "warning",
      limitInputPixels: MAX_PROOF_INPUT_PIXELS,
      sequentialRead: true,
    }).metadata();

    // Force a complete decode as the last privileged-boundary check; header
    // parsing alone is not sufficient to prove the WebP payload is decodable.
    await sharp(image.bytes, {
      failOn: "warning",
      limitInputPixels: MAX_PROOF_INPUT_PIXELS,
      sequentialRead: true,
    })
      .raw()
      .toBuffer();
  } catch (error) {
    throw new ProofError("INTERNAL_ERROR", 500, { cause: error });
  }

  if (
    detected?.mime !== SANITIZED_PROOF_MIME_TYPE ||
    image.sha256 !== digest ||
    metadata.format !== "webp" ||
    metadata.width !== image.width ||
    metadata.height !== image.height ||
    (metadata.pages ?? 1) !== 1 ||
    (metadata.pageHeight !== undefined &&
      metadata.pageHeight !== metadata.height) ||
    metadata.orientation !== undefined ||
    metadata.exif !== undefined ||
    metadata.icc !== undefined ||
    metadata.iptc !== undefined ||
    metadata.xmp !== undefined ||
    metadata.tifftagPhotoshop !== undefined
  ) {
    throw new ProofError("INTERNAL_ERROR", 500);
  }
}

function isAcceptedMimeType(value: string): value is AcceptedMimeType {
  return Object.hasOwn(acceptedImageTypes, value);
}

function mapSharpFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/pixel limit|exceeds.*pixel|limitInputPixels/i.test(message)) {
    return new ProofError("IMAGE_PIXEL_LIMIT_EXCEEDED", 413, { cause: error });
  }

  return new ProofError("CORRUPT_IMAGE", 400, { cause: error });
}

export async function sanitizeProofImage(input: {
  bytes: Uint8Array;
  filename: string;
  declaredMimeType: string;
}): Promise<SanitizedProofImage> {
  const bytes = Buffer.from(input.bytes);

  if (bytes.byteLength === 0) {
    throw new ProofError("EMPTY_FILE", 400);
  }

  if (bytes.byteLength > MAX_PROOF_FILE_BYTES) {
    throw new ProofError("FILE_TOO_LARGE", 413);
  }

  if (
    input.filename.length === 0 ||
    input.filename.length > 255 ||
    Buffer.byteLength(input.filename, "utf8") > 255 ||
    /[\u0000-\u001f\u007f/\\]/.test(input.filename)
  ) {
    throw new ProofError("INVALID_FILENAME", 400);
  }

  const extension = extname(input.filename).toLowerCase();

  if (![".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
    throw new ProofError("UNSUPPORTED_EXTENSION", 415);
  }

  if (!isAcceptedMimeType(input.declaredMimeType)) {
    throw new ProofError("UNSUPPORTED_MIME_TYPE", 415);
  }

  const detected = await fileTypeFromBuffer(bytes);

  if (!detected || !isAcceptedMimeType(detected.mime)) {
    throw new ProofError("UNSUPPORTED_SIGNATURE", 415);
  }

  if (
    detected.mime !== input.declaredMimeType ||
    !acceptedImageTypes[detected.mime].some(
      (acceptedExtension) => acceptedExtension === extension,
    )
  ) {
    throw new ProofError("IMAGE_TYPE_MISMATCH", 415);
  }

  let metadata: Metadata;

  try {
    metadata = await sharp(bytes, {
      animated: true,
      failOn: "warning",
      limitInputPixels: MAX_PROOF_INPUT_PIXELS,
      sequentialRead: true,
    }).metadata();
  } catch (error) {
    throw mapSharpFailure(error);
  }

  if (
    (metadata.pages ?? 1) !== 1 ||
    (metadata.pageHeight !== undefined &&
      metadata.pageHeight !== metadata.height)
  ) {
    throw new ProofError("ANIMATED_IMAGE_NOT_ALLOWED", 415);
  }

  if (!metadata.width || !metadata.height) {
    throw new ProofError("CORRUPT_IMAGE", 400);
  }

  if (metadata.width * metadata.height > MAX_PROOF_INPUT_PIXELS) {
    throw new ProofError("IMAGE_PIXEL_LIMIT_EXCEEDED", 413);
  }

  let result: { data: Buffer; info: OutputInfo };

  try {
    result = await sharp(bytes, {
      failOn: "warning",
      limitInputPixels: MAX_PROOF_INPUT_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .resize({
        width: MAX_PROOF_DIMENSION,
        height: MAX_PROOF_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    throw mapSharpFailure(error);
  }

  if (result.data.byteLength > MAX_PROOF_FILE_BYTES) {
    throw new ProofError("SANITIZED_IMAGE_TOO_LARGE", 413);
  }

  if (
    result.data.byteLength === 0 ||
    result.info.width < 1 ||
    result.info.height < 1 ||
    result.info.width > MAX_PROOF_DIMENSION ||
    result.info.height > MAX_PROOF_DIMENSION
  ) {
    throw new ProofError("INTERNAL_ERROR", 500);
  }

  return {
    bytes: result.data,
    mimeType: SANITIZED_PROOF_MIME_TYPE,
    sha256: createHash("sha256").update(result.data).digest("hex"),
    sizeBytes: result.data.byteLength,
    width: result.info.width,
    height: result.info.height,
  };
}
