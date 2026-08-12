import { expect, type APIRequestContext, test } from "@playwright/test";

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

async function waitForAuthEmail(
  request: APIRequestContext,
  email: string,
  excludedMessageId?: string,
) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const searchResponse = await request.get(
      `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );

    if (searchResponse.ok()) {
      const search = (await searchResponse.json()) as MailpitSearchResponse;

      for (const candidate of search.messages ?? []) {
        if (
          typeof candidate.ID !== "string" ||
          candidate.ID === excludedMessageId
        ) {
          continue;
        }

        const messageResponse = await request.get(
          `${mailpitUrl}/api/v1/message/${encodeURIComponent(candidate.ID)}`,
        );

        if (!messageResponse.ok()) {
          continue;
        }

        const message = (await messageResponse.json()) as MailpitMessage;
        const link = extractAuthLink(message);

        if (link) {
          return { id: candidate.ID, link };
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Timed out while waiting for a local authentication email.");
}

test.describe("authentication and profile", () => {
  test("blocks guests from protected pages", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    await expect(page.getByRole("heading", { name: "התחברות" })).toBeVisible();

    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/);
  });

  test("completes signup, confirmation, profile, logout, login and recovery", async ({
    page,
    request,
  }) => {
    test.skip(
      Boolean(process.env.PLAYWRIGHT_BASE_URL),
      "Mailpit-backed authentication is a local deterministic flow.",
    );

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `slice1-${suffix}@example.com`;
    const password = "Predictor123!";
    const replacementPassword = "Predictor456!";

    await page.goto("/register");
    await page.getByLabel("שם תצוגה").fill("משתמש בדיקה");
    await page.getByLabel("כתובת אימייל").fill(email);
    await page.getByLabel("סיסמה", { exact: true }).fill(password);
    await page.getByLabel("אימות סיסמה").fill(password);
    await page.getByRole("button", { name: "יצירת חשבון" }).click();

    await expect(page.getByText("ההרשמה התקבלה")).toBeVisible();

    const confirmationEmail = await waitForAuthEmail(request, email);
    await page.goto(confirmationEmail.link);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: "שלום משתמש בדיקה" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "פרופיל", exact: true }).click();
    await page.getByLabel("שם תצוגה").fill("שם מעודכן");
    await page.getByRole("button", { name: "שמירת שם התצוגה" }).click();
    await expect(page.getByText("שם התצוגה עודכן בהצלחה")).toBeVisible();

    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "שלום שם מעודכן" }),
    ).toBeVisible();

    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole("button", { name: "התנתקות" }).click();
    await expect(page).toHaveURL(/\/login\?status=signed-out$/);
    await expect(page.getByText("התנתקת בהצלחה")).toBeVisible();

    await page.getByLabel("כתובת אימייל").fill(email);
    await page.getByLabel("סיסמה").fill(password);
    await page.getByRole("button", { name: "התחברות" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole("button", { name: "התנתקות" }).click();
    await expect(page).toHaveURL(/\/login\?status=signed-out$/);
    await page.getByRole("link", { name: "שכחתי סיסמה" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByLabel("כתובת אימייל").fill(email);
    await page.getByRole("button", { name: "שליחת קישור לשחזור" }).click();
    await expect(
      page.getByText("אם קיים חשבון התואם לכתובת"),
    ).toBeVisible();

    const recoveryEmail = await waitForAuthEmail(
      request,
      email,
      confirmationEmail.id,
    );
    await page.goto(recoveryEmail.link);
    await expect(page).toHaveURL(/\/update-password$/);
    await page.getByLabel("סיסמה חדשה", { exact: true }).fill(replacementPassword);
    await page.getByLabel("אימות סיסמה חדשה").fill(replacementPassword);
    await page.getByRole("button", { name: "עדכון סיסמה" }).click();

    await expect(page).toHaveURL(/\/login\?status=password-updated$/);
    await expect(page.getByText("הסיסמה עודכנה בהצלחה")).toBeVisible();

    await page.getByLabel("כתובת אימייל").fill(email);
    await page.getByLabel("סיסמה").fill(replacementPassword);
    await page.getByRole("button", { name: "התחברות" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
