import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";

const mailpitUrl = "http://127.0.0.1:54324";

type MailpitSearchResponse = {
  messages?: { ID?: unknown }[];
};

type MailpitMessage = {
  Text?: unknown;
  HTML?: unknown;
};

export async function navigateSensitiveAuthUrl(page: Page, url: string) {
  try {
    if (url.startsWith("/") && page.url() === "about:blank") {
      await page.goto("/");
    }

    // page.goto(url) includes the target in Playwright's HTML step title.
    // Browser-side assignment keeps bearer URLs out of failure reports.
    await page.evaluate((target) => window.location.assign(target), url);
    await page.waitForLoadState("domcontentloaded");
  } catch {
    throw new Error("Sensitive authentication navigation failed.");
  }
}

export async function fillPasswordWithoutReportValue(
  page: Page,
  label: string,
  password: string,
) {
  try {
    await page
      .getByLabel(label, { exact: true })
      .evaluate((element, value) => {
        const input = element as HTMLInputElement;
        const valueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;

        if (!valueSetter) {
          throw new Error();
        }

        valueSetter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, password);
  } catch {
    throw new Error("Password field could not be filled.");
  }
}

function extractAuthLink(message: MailpitMessage) {
  const content = [message.Text, message.HTML]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .replaceAll("&amp;", "&")
    .replaceAll("=3D", "=")
    .replace(/=\r?\n/g, "");
  const links = content.match(/https?:\/\/[^\s"'<>]+/g) ?? [];

  return links.find(
    (link) => link.includes("/auth/v1/verify") || link.includes("/auth/confirm"),
  );
}

async function waitForAuthEmail(request: APIRequestContext, email: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const searchResponse = await request.get(
      `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );

    if (searchResponse.ok()) {
      const search = (await searchResponse.json()) as MailpitSearchResponse;

      for (const candidate of search.messages ?? []) {
        if (typeof candidate.ID !== "string") {
          continue;
        }

        const messageResponse = await request.get(
          `${mailpitUrl}/api/v1/message/${encodeURIComponent(candidate.ID)}`,
        );

        if (!messageResponse.ok()) {
          continue;
        }

        const link = extractAuthLink(
          (await messageResponse.json()) as MailpitMessage,
        );

        if (link) {
          return link;
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Timed out while waiting for a local authentication email.");
}

export async function registerConfirmedUser({
  browser,
  registrationPage,
  request,
  email,
  password,
  displayName,
  nextPath = "/dashboard",
  confirmInRegistrationContext = false,
  contextOptions,
}: {
  browser: Browser;
  registrationPage: Page;
  request: APIRequestContext;
  email: string;
  password: string;
  displayName: string;
  nextPath?: string;
  confirmInRegistrationContext?: boolean;
  contextOptions?: BrowserContextOptions;
}): Promise<{ context: BrowserContext; page: Page }> {
  const registrationUrl =
    nextPath === "/dashboard"
      ? "/register"
      : `/register?next=${encodeURIComponent(nextPath)}`;
  await navigateSensitiveAuthUrl(registrationPage, registrationUrl);
  await registrationPage.getByLabel("שם תצוגה").fill(displayName);
  await registrationPage.getByLabel("כתובת אימייל").fill(email);
  await fillPasswordWithoutReportValue(registrationPage, "סיסמה", password);
  await fillPasswordWithoutReportValue(
    registrationPage,
    "אימות סיסמה",
    password,
  );
  await registrationPage.getByRole("button", { name: "יצירת חשבון" }).click();
  try {
    await registrationPage
      .getByText("ההרשמה התקבלה")
      .waitFor({ state: "visible" });
  } catch {
    throw new Error("Registration completion state was not visible.");
  }

  const confirmationLink = await waitForAuthEmail(request, email);
  const context = confirmInRegistrationContext
    ? registrationPage.context()
    : await browser.newContext(contextOptions);
  const page = confirmInRegistrationContext
    ? registrationPage
    : await context.newPage();
  await navigateSensitiveAuthUrl(page, confirmationLink);

  if (confirmInRegistrationContext) {
    await expect
      .poll(() => new URL(page.url()).pathname === nextPath)
      .toBe(true);
    return { context, page };
  }

  await expect
    .poll(() => {
      const completedUrl = new URL(page.url());
      return (
        completedUrl.pathname === "/login" &&
        completedUrl.searchParams.get("status") === "confirmation-completed" &&
        completedUrl.searchParams.get("next") === null
      );
    })
    .toBe(true);
  await page.getByLabel("כתובת אימייל").fill(email);
  await fillPasswordWithoutReportValue(page, "סיסמה", password);
  await page.getByRole("button", { name: "התחברות" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/dashboard");

  return { context, page };
}
