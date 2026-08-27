import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SystemMatchesLoading from "@/app/(app)/admin/matches/loading";
import SystemSyncLoading from "@/app/(app)/admin/sync/loading";

describe("admin loading accessibility contracts", () => {
  it.each([
    ["matches", SystemMatchesLoading, "טוענים את ניהול המשחקים"],
    ["sync", SystemSyncLoading, "טוענים את מצב הסנכרון"],
  ])("names the busy %s region without a duplicate live announcement", (
    _route,
    LoadingComponent,
    accessibleName,
  ) => {
    const markup = renderToStaticMarkup(createElement(LoadingComponent));

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain(`aria-label="${accessibleName}"`);
    expect(markup).not.toContain("aria-live");
    expect(markup).not.toContain('role="status"');
    expect(markup).toContain("motion-reduce:animate-none");
  });
});
