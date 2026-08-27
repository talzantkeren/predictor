import { test as base } from "@playwright/test";

import { settleResponseStreamsBeforeCleanup } from "./response-streams";

export { devices, expect } from "@playwright/test";
export type {
  APIRequestContext,
  BrowserContext,
  BrowserContextOptions,
  Locator,
  Page,
} from "@playwright/test";

export const test = base.extend<{ responseStreamsSettled: void }>({
  responseStreamsSettled: [
    async ({ browser }, runTest) => {
      try {
        await runTest();
      } finally {
        await settleResponseStreamsBeforeCleanup(browser.contexts());
      }
    },
    { auto: true },
  ],
});
