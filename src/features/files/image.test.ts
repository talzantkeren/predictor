import { createHash } from "node:crypto";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { MAX_PROOF_FILE_BYTES } from "@/features/files/constants";
import { ProofError } from "@/features/files/errors";
import {
  assertSanitizedProofForStorage,
  sanitizeProofImage,
} from "@/features/files/image";

async function syntheticImage(
  format: "jpeg" | "png" | "webp",
  width = 64,
  height = 32,
) {
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 24, g: 120, b: 200 },
    },
  });

  return pipeline[format]().toBuffer();
}

async function expectImageError(
  operation: () => Promise<unknown>,
  code: string,
) {
  try {
    await operation();
    throw new Error("Expected image validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ProofError);
    expect((error as ProofError).code).toBe(code);
  }
}

describe("Demo proof image sanitization", () => {
  it.each([
    ["jpeg", "proof.jpg", "image/jpeg"],
    ["jpeg", "proof.jpeg", "image/jpeg"],
    ["png", "proof.png", "image/png"],
    ["webp", "proof.webp", "image/webp"],
  ] as const)("accepts a valid %s and stores only fresh WebP", async (format, filename, mime) => {
    const input = await syntheticImage(format);
    const result = await sanitizeProofImage({
      bytes: input,
      filename,
      declaredMimeType: mime,
    });
    const metadata = await sharp(result.bytes).metadata();

    expect(metadata.format).toBe("webp");
    expect(result.mimeType).toBe("image/webp");
    expect(result.width).toBe(64);
    expect(result.height).toBe(32);
    expect(result.sha256).toBe(
      createHash("sha256").update(result.bytes).digest("hex"),
    );
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ["vector.png", "image/png", Buffer.from("<svg><script>alert(1)</script></svg>"), "UNSUPPORTED_SIGNATURE"],
    ["page.jpg", "image/jpeg", Buffer.from("%PDF-1.7 synthetic"), "UNSUPPORTED_SIGNATURE"],
    ["page.jpg", "image/jpeg", Buffer.from("<html>synthetic</html>"), "UNSUPPORTED_SIGNATURE"],
    ["program.png", "image/png", Buffer.from("MZ\u0000\u0000synthetic"), "UNSUPPORTED_SIGNATURE"],
  ])("rejects disguised input %s", async (filename, mime, bytes, code) => {
    await expectImageError(
      () => sanitizeProofImage({ bytes, filename, declaredMimeType: mime }),
      code,
    );
  });

  it("requires extension, declared MIME, and signature to agree", async () => {
    const jpeg = await syntheticImage("jpeg");

    await expectImageError(
      () =>
        sanitizeProofImage({
          bytes: jpeg,
          filename: "proof.png",
          declaredMimeType: "image/jpeg",
        }),
      "IMAGE_TYPE_MISMATCH",
    );
    await expectImageError(
      () =>
        sanitizeProofImage({
          bytes: jpeg,
          filename: "proof.jpg",
          declaredMimeType: "image/png",
        }),
      "IMAGE_TYPE_MISMATCH",
    );
    await expectImageError(
      () =>
        sanitizeProofImage({
          bytes: jpeg,
          filename: "proof.gif",
          declaredMimeType: "image/jpeg",
        }),
      "UNSUPPORTED_EXTENSION",
    );
    await expectImageError(
      () =>
        sanitizeProofImage({
          bytes: jpeg,
          filename: "proof.jpg",
          declaredMimeType: "application/octet-stream",
        }),
      "UNSUPPORTED_MIME_TYPE",
    );
  });

  it("rejects empty, overly long, path-like, and control-character filenames", async () => {
    const jpeg = await syntheticImage("jpeg");

    for (const filename of [
      "",
      `${"a".repeat(252)}.jpg`,
      "folder/proof.jpg",
      "folder\\proof.jpg",
      "proof\n.jpg",
    ]) {
      await expectImageError(
        () =>
          sanitizeProofImage({
            bytes: jpeg,
            filename,
            declaredMimeType: "image/jpeg",
          }),
        "INVALID_FILENAME",
      );
    }
  });

  it("rejects empty, corrupt, and oversized content", async () => {
    await expectImageError(
      () =>
        sanitizeProofImage({
          bytes: Buffer.alloc(0),
          filename: "proof.png",
          declaredMimeType: "image/png",
        }),
      "EMPTY_FILE",
    );

    const jpeg = await syntheticImage("jpeg");
    await expectImageError(
      () =>
        sanitizeProofImage({
          bytes: jpeg.subarray(0, 20),
          filename: "proof.jpg",
          declaredMimeType: "image/jpeg",
        }),
      "CORRUPT_IMAGE",
    );

    await expectImageError(
      () =>
        sanitizeProofImage({
          bytes: Buffer.alloc(MAX_PROOF_FILE_BYTES + 1),
          filename: "proof.png",
          declaredMimeType: "image/png",
        }),
      "FILE_TOO_LARGE",
    );
  });

  it("auto-orients pixels and strips EXIF and other metadata", async () => {
    const oriented = await sharp({
      create: {
        width: 40,
        height: 20,
        channels: 3,
        background: "red",
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await sanitizeProofImage({
      bytes: oriented,
      filename: "oriented.jpg",
      declaredMimeType: "image/jpeg",
    });
    const metadata = await sharp(result.bytes).metadata();

    expect([result.width, result.height]).toEqual([20, 40]);
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it("limits dimensions without enlarging small images", async () => {
    const small = await sanitizeProofImage({
      bytes: await syntheticImage("png", 10, 20),
      filename: "small.png",
      declaredMimeType: "image/png",
    });
    const wide = await sanitizeProofImage({
      bytes: await syntheticImage("png", 3_000, 1_000),
      filename: "wide.png",
      declaredMimeType: "image/png",
    });

    expect([small.width, small.height]).toEqual([10, 20]);
    expect(wide.width).toBe(2_000);
    expect(wide.height).toBeLessThanOrEqual(2_000);
  });

  it("rejects inputs above the 20-million-pixel decode limit", async () => {
    const tooManyPixels = await syntheticImage("png", 5_000, 4_001);

    await expectImageError(
      () =>
        sanitizeProofImage({
          bytes: tooManyPixels,
          filename: "huge.png",
          declaredMimeType: "image/png",
        }),
      "IMAGE_PIXEL_LIMIT_EXCEEDED",
    );
  });

  it("rejects animated WebP rather than silently accepting the first frame", async () => {
    const gif = Buffer.from(
      "47494638396101000100800000000000ffffff21f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b",
      "hex",
    );
    const animatedWebp = await sharp(gif, { animated: true })
      .webp({ delay: [100, 100], loop: 0 })
      .toBuffer();

    await expectImageError(
      () =>
        sanitizeProofImage({
          bytes: animatedWebp,
          filename: "animated.webp",
          declaredMimeType: "image/webp",
        }),
      "ANIMATED_IMAGE_NOT_ALLOWED",
    );
  });

  it("produces a deterministic digest for an identical sanitized image", async () => {
    const input = await syntheticImage("png", 100, 50);
    const first = await sanitizeProofImage({
      bytes: input,
      filename: "proof.png",
      declaredMimeType: "image/png",
    });
    const second = await sanitizeProofImage({
      bytes: input,
      filename: "proof.png",
      declaredMimeType: "image/png",
    });

    expect(second.sha256).toBe(first.sha256);
    expect(second.bytes.equals(first.bytes)).toBe(true);
  });

  it("makes the privileged gateway reject forged sanitized payloads", async () => {
    const valid = await sanitizeProofImage({
      bytes: await syntheticImage("png"),
      filename: "proof.png",
      declaredMimeType: "image/png",
    });

    await expect(assertSanitizedProofForStorage(valid)).resolves.toBeUndefined();
    await expectImageError(
      () =>
        assertSanitizedProofForStorage({
          ...valid,
          bytes: Buffer.from("not-a-webp"),
          sizeBytes: 10,
          sha256: createHash("sha256").update("not-a-webp").digest("hex"),
        }),
      "INTERNAL_ERROR",
    );
    await expectImageError(
      () =>
        assertSanitizedProofForStorage({
          ...valid,
          sha256: "0".repeat(64),
        }),
      "INTERNAL_ERROR",
    );

    await expectImageError(
      () =>
        assertSanitizedProofForStorage({
          ...valid,
          width: valid.width + 1,
        }),
      "INTERNAL_ERROR",
    );

    const gif = Buffer.from(
      "47494638396101000100800000000000ffffff21f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b",
      "hex",
    );
    const animatedBytes = await sharp(gif, { animated: true })
      .webp({ delay: [100, 100], loop: 0 })
      .toBuffer();
    const animatedMetadata = await sharp(animatedBytes, {
      animated: true,
    }).metadata();
    await expectImageError(
      () =>
        assertSanitizedProofForStorage({
          ...valid,
          bytes: animatedBytes,
          sizeBytes: animatedBytes.byteLength,
          sha256: createHash("sha256").update(animatedBytes).digest("hex"),
          width: animatedMetadata.width ?? 1,
          height: animatedMetadata.height ?? 1,
        }),
      "INTERNAL_ERROR",
    );

    const metadataBytes = await sharp({
      create: {
        width: 16,
        height: 8,
        channels: 3,
        background: "red",
      },
    })
      .withMetadata({ orientation: 6 })
      .webp()
      .toBuffer();
    const metadataImage = await sharp(metadataBytes).metadata();
    await expectImageError(
      () =>
        assertSanitizedProofForStorage({
          ...valid,
          bytes: metadataBytes,
          sizeBytes: metadataBytes.byteLength,
          sha256: createHash("sha256").update(metadataBytes).digest("hex"),
          width: metadataImage.width ?? 1,
          height: metadataImage.height ?? 1,
        }),
      "INTERNAL_ERROR",
    );
  });
});
