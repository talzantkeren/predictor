import { describe, expect, it } from "vitest";

import { containsDangerousBidiControl } from "@/lib/untrusted-text";

describe("untrusted display text", () => {
  it.each([
    ["ARABIC LETTER MARK", "\u061c"],
    ["LEFT-TO-RIGHT MARK", "\u200e"],
    ["RIGHT-TO-LEFT MARK", "\u200f"],
    ["LEFT-TO-RIGHT EMBEDDING", "\u202a"],
    ["RIGHT-TO-LEFT EMBEDDING", "\u202b"],
    ["POP DIRECTIONAL FORMATTING", "\u202c"],
    ["LEFT-TO-RIGHT OVERRIDE", "\u202d"],
    ["RIGHT-TO-LEFT OVERRIDE", "\u202e"],
    ["LEFT-TO-RIGHT ISOLATE", "\u2066"],
    ["RIGHT-TO-LEFT ISOLATE", "\u2067"],
    ["FIRST STRONG ISOLATE", "\u2068"],
    ["POP DIRECTIONAL ISOLATE", "\u2069"],
  ])("rejects the invisible %s character", (_name, control) => {
    expect(containsDangerousBidiControl(`ליגה ${control}Predictor`)).toBe(true);
  });

  it.each([
    "ליגת Predictor FC 2026",
    "Maccabi תל אביב",
    "دوري Predictor 2026",
    "בית״ר (U19) / Academy",
  ])("keeps legitimate mixed-script text: %s", (value) => {
    expect(containsDangerousBidiControl(value)).toBe(false);
  });
});
