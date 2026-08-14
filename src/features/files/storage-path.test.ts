import { describe, expect, it } from "vitest";

import {
  createProofStoragePath,
  isExpectedProofStoragePath,
} from "@/features/files/storage-path";

const coordinates = {
  leagueId: "11111111-1111-4111-8111-111111111111",
  requestId: "22222222-2222-4222-8222-222222222222",
  proofId: "33333333-3333-4333-8333-333333333333",
};

describe("private proof Storage paths", () => {
  it("derives the immutable path entirely from server-side UUID coordinates", () => {
    expect(createProofStoragePath(coordinates)).toBe(
      "league/11111111-1111-4111-8111-111111111111/request/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp",
    );
  });

  it("normalizes UUID casing without accepting path fragments", () => {
    expect(
      createProofStoragePath({
        ...coordinates,
        proofId: coordinates.proofId.toUpperCase(),
      }),
    ).toBe(createProofStoragePath(coordinates));

    expect(() =>
      createProofStoragePath({ ...coordinates, proofId: "../private" }),
    ).toThrow("Invalid proof object coordinates");
  });

  it("requires metadata to contain the exact expected path", () => {
    expect(
      isExpectedProofStoragePath(createProofStoragePath(coordinates), coordinates),
    ).toBe(true);
    expect(
      isExpectedProofStoragePath(
        createProofStoragePath({
          ...coordinates,
          requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
        coordinates,
      ),
    ).toBe(false);
    expect(isExpectedProofStoragePath("../payment-proofs", coordinates)).toBe(
      false,
    );
  });
});
