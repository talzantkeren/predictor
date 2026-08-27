import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { IsolatedText } from "@/components/ui/isolated-text";

describe("IsolatedText", () => {
  it("renders untrusted mixed-script text in an auto-directed bdi boundary", () => {
    const value = "ליגת Predictor FC 2026";
    const isolated = IsolatedText({
      children: value,
      className: "break-words",
    });
    const markup = renderToStaticMarkup(
      createElement(
        "p",
        null,
        "מקום 1 · ",
        isolated,
        " · 9",
      ),
    );

    expect(markup).toContain(
      `<bdi dir="auto" class="break-words">${value}</bdi>`,
    );
    expect(markup).not.toContain("dir=\"rtl\"");
  });
});
