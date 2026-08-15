import { describe, expect, it } from "vitest";

import { ProofError } from "@/features/files/errors";
import {
  assertDemoMode,
  assertTrustedSameOrigin,
} from "@/features/files/security";

function expectCode(run: () => void, code: string) {
  try {
    run();
    throw new Error("Expected the operation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ProofError);
    expect((error as ProofError).code).toBe(code);
  }
}

describe("proof route security checks", () => {
  it("requires Demo mode", () => {
    expect(() => assertDemoMode(true)).not.toThrow();
    expectCode(() => assertDemoMode(false), "DEMO_MODE_REQUIRED");
  });

  it("accepts only the exact trusted application origin", () => {
    expect(() =>
      assertTrustedSameOrigin(
        "https://predictor.example",
        "https://predictor.example/app",
      ),
    ).not.toThrow();

    for (const origin of [
      null,
      "null",
      "https://attacker.example",
      "http://predictor.example",
      "https://predictor.example:444",
      "https://predictor.example.attacker.test",
    ]) {
      expectCode(
        () =>
          assertTrustedSameOrigin(origin, "https://predictor.example"),
        "INVALID_ORIGIN",
      );
    }
  });

  it("accepts an exact trusted Vercel preview host", () => {
    expect(() =>
      assertTrustedSameOrigin(
        "https://predictor-git-slice-3.example.vercel.app",
        "https://predictor.example",
        [
          "predictor-git-slice-3.example.vercel.app",
          "https://predictor-other.example.vercel.app/path-is-ignored",
        ],
      ),
    ).not.toThrow();

    for (const origin of [
      "http://predictor-git-slice-3.example.vercel.app",
      "https://predictor-git-slice-3.example.vercel.app.attacker.test",
      "https://attacker.example",
    ]) {
      expectCode(
        () =>
          assertTrustedSameOrigin(origin, "https://predictor.example", [
            "predictor-git-slice-3.example.vercel.app",
          ]),
        "INVALID_ORIGIN",
      );
    }
  });

  it("ignores absent and malformed preview-host values", () => {
    expectCode(
      () =>
        assertTrustedSameOrigin(
          "https://attacker.example",
          "https://predictor.example",
          [undefined, "https:\\attacker.example", "javascript:alert(1)"],
        ),
      "INVALID_ORIGIN",
    );
  });

  it("fails closed when the trusted URL is malformed", () => {
    expectCode(
      () => assertTrustedSameOrigin("https://predictor.example", "invalid"),
      "INTERNAL_ERROR",
    );
  });
});
