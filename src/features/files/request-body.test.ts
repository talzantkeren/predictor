import { describe, expect, it } from "vitest";

import {
  MAX_PROOF_FILE_BYTES,
  MAX_PROOF_REQUEST_BYTES,
} from "@/features/files/constants";
import { ProofError } from "@/features/files/errors";
import {
  assertProofRequestSizeHeaders,
  parseProofMultipartForm,
  readBoundedRequestBody,
} from "@/features/files/request-body";

const idempotencyKey = "11111111-1111-4111-8111-111111111111";

async function expectProofError(
  operation: () => Promise<unknown> | unknown,
  code: string,
) {
  try {
    await operation();
    throw new Error("Expected the operation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ProofError);
    expect((error as ProofError).code).toBe(code);
  }
}

async function encodeForm(formData: FormData) {
  const request = new Request("http://localhost/upload", {
    method: "POST",
    body: formData,
  });
  const body = new Uint8Array(await request.arrayBuffer());
  return { request, body };
}

function validForm() {
  const form = new FormData();
  form.append(
    "proof",
    new File([new Uint8Array([1, 2, 3])], "proof.png", {
      type: "image/png",
    }),
  );
  form.append("idempotencyKey", idempotencyKey);
  return form;
}

describe("bounded multipart proof requests", () => {
  it("accepts exactly the request byte limit", async () => {
    const bytes = Buffer.alloc(MAX_PROOF_REQUEST_BYTES, 1);
    const request = new Request("http://localhost/upload", {
      method: "POST",
      body: bytes,
    });

    await expect(readBoundedRequestBody(request)).resolves.toHaveLength(
      MAX_PROOF_REQUEST_BYTES,
    );
  });

  it("rejects one byte over the streamed request limit even with no Content-Length", async () => {
    const bytes = Buffer.alloc(MAX_PROOF_REQUEST_BYTES + 1, 1);
    const request = new Request("http://localhost/upload", {
      method: "POST",
      body: bytes,
    });

    await expectProofError(
      () => readBoundedRequestBody(request),
      "REQUEST_TOO_LARGE",
    );
  });

  it("rejects oversized and malformed Content-Length before reading", () => {
    const oversized = new Request("http://localhost/upload", {
      method: "POST",
      headers: { "content-length": String(MAX_PROOF_REQUEST_BYTES + 1) },
    });

    expect(() => assertProofRequestSizeHeaders(oversized)).toThrowError(
      expect.objectContaining({ code: "REQUEST_TOO_LARGE" }),
    );

    for (const contentLength of ["-1", "not-a-number", "1.5"]) {
      const malformed = new Request("http://localhost/upload", {
        method: "POST",
        headers: { "content-length": contentLength },
      });

      expect(() => assertProofRequestSizeHeaders(malformed)).toThrowError(
        expect.objectContaining({ code: "INVALID_CONTENT_LENGTH" }),
      );
    }
  });

  it("accepts an exact-size file with its real multipart overhead", async () => {
    const form = new FormData();
    form.append(
      "proof",
      new File([Buffer.alloc(MAX_PROOF_FILE_BYTES)], "proof.webp", {
        type: "image/webp",
      }),
    );
    form.append("idempotencyKey", idempotencyKey);
    const encoded = await encodeForm(form);

    expect(encoded.body.byteLength).toBeGreaterThan(MAX_PROOF_FILE_BYTES);
    expect(encoded.body.byteLength).toBeLessThanOrEqual(
      MAX_PROOF_REQUEST_BYTES,
    );

    const boundedRequest = new Request("http://localhost/upload", {
      method: "POST",
      headers: encoded.request.headers,
      body: encoded.body,
    });
    const boundedBody = await readBoundedRequestBody(boundedRequest);
    const parsed = await parseProofMultipartForm(
      encoded.request,
      boundedBody,
    );

    expect(parsed.file.size).toBe(MAX_PROOF_FILE_BYTES);
  });

  it("rejects a real multipart envelope over the complete request limit", async () => {
    const form = new FormData();
    form.append(
      "proof",
      new File([Buffer.alloc(MAX_PROOF_FILE_BYTES)], "proof.webp", {
        type: "image/webp",
      }),
    );
    form.append("idempotencyKey", idempotencyKey);
    form.append("padding", "x".repeat(300_000));
    const encoded = await encodeForm(form);

    expect(encoded.body.byteLength).toBeGreaterThan(MAX_PROOF_REQUEST_BYTES);

    const request = new Request("http://localhost/upload", {
      method: "POST",
      headers: encoded.request.headers,
      body: encoded.body,
    });
    await expectProofError(
      () => readBoundedRequestBody(request),
      "REQUEST_TOO_LARGE",
    );
  });

  it("fails closed when the request stream aborts", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.error(new Error("request aborted"));
      },
    });
    const requestInit: RequestInit & { duplex: "half" } = {
      method: "POST",
      body,
      duplex: "half",
    };
    const request = new Request("http://localhost/upload", requestInit);

    await expectProofError(
      () => readBoundedRequestBody(request),
      "INVALID_MULTIPART",
    );
  });

  it("parses exactly one proof and one canonical UUID idempotency key", async () => {
    const encoded = await encodeForm(validForm());
    const result = await parseProofMultipartForm(encoded.request, encoded.body);

    expect(result.file.name).toBe("proof.png");
    expect(result.file.type).toBe("image/png");
    expect(result.idempotencyKey).toBe(idempotencyKey);
  });

  it.each([
    ["no proof", () => {
      const form = new FormData();
      form.append("idempotencyKey", idempotencyKey);
      return form;
    }, "MISSING_FILE"],
    ["two proofs", () => {
      const form = validForm();
      form.append("proof", new File(["x"], "second.png", { type: "image/png" }));
      return form;
    }, "DUPLICATE_FILE"],
    ["no idempotency key", () => {
      const form = validForm();
      form.delete("idempotencyKey");
      return form;
    }, "MISSING_IDEMPOTENCY_KEY"],
    ["two idempotency keys", () => {
      const form = validForm();
      form.append("idempotencyKey", idempotencyKey);
      return form;
    }, "DUPLICATE_IDEMPOTENCY_KEY"],
    ["invalid idempotency key", () => {
      const form = validForm();
      form.set("idempotencyKey", "not-a-uuid");
      return form;
    }, "INVALID_IDEMPOTENCY_KEY"],
    ["unexpected field", () => {
      const form = validForm();
      form.append("requestId", idempotencyKey);
      return form;
    }, "UNEXPECTED_FORM_FIELD"],
  ])("rejects %s", async (_label, createForm, code) => {
    const encoded = await encodeForm(createForm());
    await expectProofError(
      () => parseProofMultipartForm(encoded.request, encoded.body),
      code,
    );
  });

  it("rejects a string masquerading as the proof field", async () => {
    const form = new FormData();
    form.append("proof", "not-a-file");
    form.append("idempotencyKey", idempotencyKey);
    const encoded = await encodeForm(form);

    await expectProofError(
      () => parseProofMultipartForm(encoded.request, encoded.body),
      "MISSING_FILE",
    );
  });

  it("rejects empty and one-byte-over-limit files", async () => {
    for (const [bytes, code] of [
      [Buffer.alloc(0), "EMPTY_FILE"],
      [Buffer.alloc(MAX_PROOF_FILE_BYTES + 1), "FILE_TOO_LARGE"],
    ] as const) {
      const form = new FormData();
      form.append("proof", new File([bytes], "proof.png", { type: "image/png" }));
      form.append("idempotencyKey", idempotencyKey);
      const encoded = await encodeForm(form);

      await expectProofError(
        () => parseProofMultipartForm(encoded.request, encoded.body),
        code,
      );
    }
  });

  it("rejects a non-multipart body", async () => {
    const request = new Request("http://localhost/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    await expectProofError(
      () => parseProofMultipartForm(request, Buffer.from("{}")),
      "INVALID_MULTIPART",
    );
  });
});
