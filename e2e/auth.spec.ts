import { expect, type APIRequestContext, test } from "@playwright/test";

import {
  fillPasswordWithoutReportValue,
  navigateSensitiveAuthUrl,
} from "./support/local-auth";

const mailpitUrl = "http://127.0.0.1:54324";

type MailpitSearchResponse = {
  messages?: { ID?: unknown }[];
};

type MailpitMessage = {
  Text?: unknown;
  HTML?: unknown;
};

type AuthErrorResponse = {
  code?: unknown;
  error_code?: unknown;
};

type PasswordSessionResponse = {
  access_token?: unknown;
  user?: { id?: unknown };
};

function getLocalAuthConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (typeof url !== "string" || typeof publishableKey !== "string") {
    throw new Error("Local Supabase Auth configuration is unavailable.");
  }

  return { publishableKey, url };
}

async function signInThroughAuth(
  email: string,
  password: string,
) {
  const { publishableKey, url } = getLocalAuthConfiguration();
  const response = await fetchWithoutSensitiveReport(
    `${url}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
  );
  const result = (await response.json()) as PasswordSessionResponse;

  expect(response.ok).toBe(true);
  expect(typeof result.access_token).toBe("string");
  expect(typeof result.user?.id).toBe("string");

  return {
    accessToken: result.access_token as string,
    userId: result.user?.id as string,
  };
}

async function fetchWithoutSensitiveReport(url: string, init?: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error("Sensitive local authentication request failed.");
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

async function waitForAuthEmail(
  request: APIRequestContext,
  email: string,
  excludedMessageIds: Iterable<string> = [],
) {
  const excludedIds = new Set(excludedMessageIds);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const searchResponse = await request.get(
      `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );

    if (searchResponse.ok()) {
      const search = (await searchResponse.json()) as MailpitSearchResponse;

      for (const candidate of search.messages ?? []) {
        if (
          typeof candidate.ID !== "string" ||
          excludedIds.has(candidate.ID)
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
  test("@preview blocks guests and returns private confirmation responses", async ({
    page,
    request,
  }) => {
    const confirmationResponse = await request.get("/auth/confirm", {
      maxRedirects: 0,
    });

    expect(confirmationResponse.status()).toBe(307);
    expect(confirmationResponse.headers()["cache-control"]).toContain("private");
    expect(confirmationResponse.headers()["cache-control"]).toContain("no-store");
    expect(confirmationResponse.headers().expires).toBe("0");
    expect(confirmationResponse.headers().pragma).toBe("no-cache");

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    await expect(page.getByRole("heading", { name: "התחברות" })).toBeVisible();

    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/);
  });

  test("enforces the password minimum in Supabase Auth", async () => {
    const { publishableKey, url: supabaseUrl } = getLocalAuthConfiguration();
    const weakPassword = crypto.randomUUID().replaceAll("-", "").slice(0, 7);

    const response = await fetchWithoutSensitiveReport(
      `${supabaseUrl}/auth/v1/signup`,
      {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: `short-password-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
          password: weakPassword,
        }),
      },
    );
    const error = (await response.json()) as AuthErrorResponse;

    expect(response.ok).toBe(false);
    expect(response.status).toBe(422);
    expect(error.code).toBe(422);
    expect(error.error_code).toBe("weak_password");
  });

  test("completes signup, confirmation, profile, logout, login and recovery", async ({
    browser,
    page,
    request,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `slice1-${suffix}@example.com`;
    const secondEmail = `slice1-second-${suffix}@example.com`;
    const password = `Aa1!${crypto.randomUUID()}`;
    const replacementPassword = `Bb2!${crypto.randomUUID()}`;

    await page.goto("/register");
    await page.getByLabel("שם תצוגה").fill("משתמש בדיקה");
    await page.getByLabel("כתובת אימייל").fill(email);
    await fillPasswordWithoutReportValue(page, "סיסמה", password);
    await fillPasswordWithoutReportValue(page, "אימות סיסמה", password);
    await page.getByRole("button", { name: "יצירת חשבון" }).click();

    await expect(page.getByText("ההרשמה התקבלה")).toBeVisible();

    const confirmationEmail = await waitForAuthEmail(request, email);
    const confirmationContext = await browser.newContext();
    const flowPage = await confirmationContext.newPage();
    await navigateSensitiveAuthUrl(flowPage, confirmationEmail.link);
    await expect(flowPage).toHaveURL(/\/login\?status=confirmation-completed$/);
    await expect(flowPage.getByText("כתובת האימייל אושרה")).toBeVisible();
    await flowPage.getByLabel("כתובת אימייל").fill(email);
    await fillPasswordWithoutReportValue(flowPage, "סיסמה", password);
    await flowPage.getByRole("button", { name: "התחברות" }).click();
    await expect(flowPage).toHaveURL(/\/dashboard$/);
    await expect(
      flowPage.getByRole("heading", { name: "שלום משתמש בדיקה" }),
    ).toBeVisible();

    await flowPage.getByRole("link", { name: "פרופיל", exact: true }).click();
    await flowPage.getByLabel("שם תצוגה").fill("שם מעודכן");
    await flowPage.getByRole("button", { name: "שמירת שם התצוגה" }).click();
    await expect(flowPage.getByText("שם התצוגה עודכן בהצלחה")).toBeVisible();

    await flowPage.goto("/dashboard");
    await expect(
      flowPage.getByRole("heading", { name: "שלום שם מעודכן" }),
    ).toBeVisible();

    await flowPage.goto("/login");
    await expect(flowPage).toHaveURL(/\/dashboard$/);
    await flowPage.goto("/register");
    await expect(flowPage).toHaveURL(/\/dashboard$/);

    await flowPage.getByRole("button", { name: "התנתקות" }).click();
    await expect(flowPage).toHaveURL(/\/login\?status=signed-out$/);
    await expect(flowPage.getByText("התנתקת בהצלחה")).toBeVisible();
    await flowPage.goto("/dashboard");
    await expect(flowPage).toHaveURL(/\/login\?next=%2Fdashboard$/);

    await flowPage.goto("/login?next=https://attacker.example");
    await flowPage.getByLabel("כתובת אימייל").fill(email);
    await fillPasswordWithoutReportValue(flowPage, "סיסמה", password);
    await flowPage.getByRole("button", { name: "התחברות" }).click();
    await expect(flowPage).toHaveURL(/\/dashboard$/);

    await flowPage.getByRole("button", { name: "התנתקות" }).click();
    await expect(flowPage).toHaveURL(/\/login\?status=signed-out$/);
    await flowPage.getByRole("link", { name: "שכחתי סיסמה" }).click();
    await expect(flowPage).toHaveURL(/\/forgot-password$/);
    await flowPage.getByLabel("כתובת אימייל").fill(email);
    await flowPage.getByRole("button", { name: "שליחת קישור לשחזור" }).click();
    await expect(
      flowPage.getByText("אם קיים חשבון התואם לכתובת"),
    ).toBeVisible();

    const recoveryEmail = await waitForAuthEmail(
      request,
      email,
      [confirmationEmail.id],
    );
    const recoveryContext = await browser.newContext();
    const recoveryPage = await recoveryContext.newPage();
    await navigateSensitiveAuthUrl(recoveryPage, recoveryEmail.link);
    await expect(recoveryPage).toHaveURL(
      /\/forgot-password\?status=recovery-browser-mismatch$/,
    );
    await expect(
      recoveryPage.getByText("יש לבקש כאן קישור חדש"),
    ).toBeVisible();
    await recoveryPage.waitForTimeout(1_100);
    await recoveryPage.getByLabel("כתובת אימייל").fill(email);
    await recoveryPage
      .getByRole("button", { name: "שליחת קישור לשחזור" })
      .click();
    await expect(
      recoveryPage.getByText("אם קיים חשבון התואם לכתובת"),
    ).toBeVisible();

    const sameBrowserRecoveryEmail = await waitForAuthEmail(
      request,
      email,
      [confirmationEmail.id, recoveryEmail.id],
    );
    await navigateSensitiveAuthUrl(recoveryPage, sameBrowserRecoveryEmail.link);
    await expect(recoveryPage).toHaveURL(/\/update-password$/);
    await fillPasswordWithoutReportValue(
      recoveryPage,
      "סיסמה חדשה",
      replacementPassword,
    );
    await fillPasswordWithoutReportValue(
      recoveryPage,
      "אימות סיסמה חדשה",
      replacementPassword,
    );
    await recoveryPage.getByRole("button", { name: "עדכון סיסמה" }).click();

    await expect(recoveryPage).toHaveURL(/\/login\?status=password-updated$/);
    await expect(recoveryPage.getByText("הסיסמה עודכנה בהצלחה")).toBeVisible();
    await expect
      .poll(async () =>
        (await recoveryContext.cookies()).some(
          (cookie) => cookie.name === "predictor_recovery",
        ),
      )
      .toBe(false);

    await recoveryPage.getByLabel("כתובת אימייל").fill(email);
    await fillPasswordWithoutReportValue(
      recoveryPage,
      "סיסמה",
      replacementPassword,
    );
    await recoveryPage.getByRole("button", { name: "התחברות" }).click();
    await expect(recoveryPage).toHaveURL(/\/dashboard$/);

    await page.goto("/register");
    await page.getByLabel("שם תצוגה").fill("משתמש שני");
    await page.getByLabel("כתובת אימייל").fill(secondEmail);
    await fillPasswordWithoutReportValue(page, "סיסמה", password);
    await fillPasswordWithoutReportValue(page, "אימות סיסמה", password);
    await page.getByRole("button", { name: "יצירת חשבון" }).click();
    await expect(page.getByText("ההרשמה התקבלה")).toBeVisible();

    const secondConfirmationEmail = await waitForAuthEmail(request, secondEmail);
    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    await navigateSensitiveAuthUrl(secondPage, secondConfirmationEmail.link);
    await expect(secondPage).toHaveURL(
      /\/login\?status=confirmation-completed$/,
    );
    await secondPage.getByLabel("כתובת אימייל").fill(secondEmail);
    await fillPasswordWithoutReportValue(secondPage, "סיסמה", password);
    await secondPage.getByRole("button", { name: "התחברות" }).click();
    await expect(secondPage).toHaveURL(/\/dashboard$/);
    await expect(
      secondPage.getByRole("heading", { name: "שלום משתמש שני" }),
    ).toBeVisible();

    const firstSession = await signInThroughAuth(
      email,
      replacementPassword,
    );
    const secondSession = await signInThroughAuth(secondEmail, password);
    const { publishableKey, url: supabaseUrl } = getLocalAuthConfiguration();
    const foreignProfileUrl = `${supabaseUrl}/rest/v1/profiles?id=eq.${firstSession.userId}&select=id,display_name`;
    const foreignRead = await fetchWithoutSensitiveReport(foreignProfileUrl, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${secondSession.accessToken}`,
      },
    });

    expect(foreignRead.ok).toBe(true);
    expect(await foreignRead.json()).toEqual([]);

    const foreignUpdate = await fetchWithoutSensitiveReport(foreignProfileUrl, {
      method: "PATCH",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${secondSession.accessToken}`,
        Prefer: "return=representation",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ display_name: "ניסיון שינוי זר" }),
    });

    expect(foreignUpdate.ok).toBe(true);
    expect(await foreignUpdate.json()).toEqual([]);

    await confirmationContext.close();
    await recoveryContext.close();
    await secondContext.close();
  });
});
