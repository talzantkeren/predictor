import { errors, type BrowserContext, type Page } from "@playwright/test";

type ResponseStreamOwner = BrowserContext | Page;

function pagesFor(owner: ResponseStreamOwner) {
  return "pages" in owner ? owner.pages() : [owner];
}

export async function settleResponseStreamsBeforeCleanup(
  owners: readonly ResponseStreamOwner[],
) {
  const pages = [...new Set(owners.flatMap(pagesFor))].filter(
    (page) => !page.isClosed(),
  );

  const results = await Promise.allSettled(
    pages.map((page) =>
      page.waitForLoadState("networkidle", { timeout: 10_000 }),
    ),
  );
  for (const result of results) {
    if (
      result.status === "rejected" &&
      !(result.reason instanceof errors.TimeoutError)
    ) {
      throw result.reason;
    }
  }
}

export async function closeContextsAfterResponseStreams(
  contexts: readonly BrowserContext[],
) {
  await settleResponseStreamsBeforeCleanup(contexts);
  await Promise.all(contexts.map((context) => context.close()));
}
