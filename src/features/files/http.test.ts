import { describe, expect, it } from "vitest";

import { ProofError } from "@/features/files/errors";
import {
  privateJson,
  privateRedirect,
  proofErrorJson,
} from "@/features/files/http";

function expectPrivateHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toContain("private");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("expires")).toBe("0");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

describe("private proof HTTP responses", () => {
  it("marks upload JSON private and varies it by Cookie and Origin", async () => {
    const response = privateJson({ data: { status: "pending_approval" } }, {
      status: 201,
      varyOrigin: true,
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("vary")).toBe("Cookie, Origin");
    expectPrivateHeaders(response);
    await expect(response.json()).resolves.toEqual({
      data: { status: "pending_approval" },
    });
  });

  it("returns only stable safe error fields and a bounded Retry-After", async () => {
    const response = proofErrorJson(
      new ProofError("RATE_LIMITED", 429, { retryAfterSeconds: 42 }),
      true,
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expectPrivateHeaders(response);
    expect(body).toMatchObject({
      code: "RATE_LIMITED",
      message: expect.any(String),
      error: { code: "RATE_LIMITED", message: expect.any(String) },
    });
    expect(JSON.stringify(body)).not.toContain("stack");
    expect(JSON.stringify(body)).not.toContain("cause");
  });

  it("redirects signed access without permitting response caching or referrers", () => {
    const response = privateRedirect(
      "https://storage.example/signed/object?token=synthetic",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://storage.example/signed/object?token=synthetic",
    );
    expectPrivateHeaders(response);
  });
});
