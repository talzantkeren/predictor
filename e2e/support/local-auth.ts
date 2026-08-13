import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
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
}: {
  browser: Browser;
  registrationPage: Page;
  request: APIRequestContext;
  email: string;
  password: string;
  displayName: string;
}): Promise<{ context: BrowserContext; page: Page }> {
  await registrationPage.goto("/register");
  await registrationPage.getByLabel("שם תצוגה").fill(displayName);
  await registrationPage.getByLabel("כתובת אימייל").fill(email);
  await registrationPage.getByLabel("סיסמה", { exact: true }).fill(password);
  await registrationPage.getByLabel("אימות סיסמה").fill(password);
  await registrationPage.getByRole("button", { name: "יצירת חשבון" }).click();
  await expect(registrationPage.getByText("ההרשמה התקבלה")).toBeVisible();

  const confirmationLink = await waitForAuthEmail(request, email);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(confirmationLink);
  await expect(page).toHaveURL(/\/login\?status=confirmation-completed$/);
  await page.getByLabel("כתובת אימייל").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "התחברות" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  return { context, page };
}
