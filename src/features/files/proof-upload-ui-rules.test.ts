import { describe, expect, it } from "vitest";

import { validateSelectedFile } from "@/features/files/components/proof-upload-form";

function imageFile(
  name: string,
  type: string,
  size: number,
) {
  return new File([new Uint8Array(size)], name, { type });
}

describe("proof upload client-side convenience validation", () => {
  it.each([
    ["demo.jpg", "image/jpeg"],
    ["demo.jpeg", "image/jpeg"],
    ["demo.png", "image/png"],
    ["demo.webp", "image/webp"],
  ])("accepts a matching %s file", (name, type) => {
    expect(validateSelectedFile(imageFile(name, type, 1))).toBeUndefined();
  });

  it("accepts the exact file-size limit and rejects one byte over", () => {
    expect(
      validateSelectedFile(imageFile("demo.png", "image/png", 4_000_000)),
    ).toBeUndefined();
    expect(
      validateSelectedFile(imageFile("demo.png", "image/png", 4_000_001)),
    ).toContain("גדולה מדי");
  });

  it.each([
    ["demo.svg", "image/svg+xml"],
    ["demo.png", "image/jpeg"],
    ["demo.jpg", "application/octet-stream"],
    ["demo", "image/png"],
  ])("rejects an unsupported or mismatched %s file", (name, type) => {
    expect(validateSelectedFile(imageFile(name, type, 1))).toContain(
      "סיומת וסוג תואמים",
    );
  });

  it("rejects an empty file", () => {
    expect(
      validateSelectedFile(imageFile("demo.webp", "image/webp", 0)),
    ).toContain("שאינה ריקה");
  });
});
