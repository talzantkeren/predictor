import {
  devices,
  expect,
  type BrowserContext,
  type BrowserContextOptions,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import sharp from "sharp";

import { hashInviteToken } from "@/features/membership/invite-token";

import {
  expireInviteInDisposableLocalDatabase,
  removeInviteFromDisposableLocalDatabase,
} from "./support/local-database";
import { registerConfirmedUser } from "./support/local-auth";

test.use({ screenshot: "off", trace: "off", video: "off" });

type PasswordSessionResponse = {
  access_token?: unknown;
};

function getLocalSupabaseConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Local Supabase configuration is unavailable.");
  }

  return { publishableKey, url };
}

async function signInForDataApi(
  email: string,
  password: string,
) {
  const { publishableKey, url } = getLocalSupabaseConfiguration();
  const response = await fetchSensitiveUrl(
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
  const session = (await response.json()) as PasswordSessionResponse;

  expect(response.ok).toBe(true);
  expect(typeof session.access_token).toBe("string");

  return session.access_token as string;
}

async function callAuthenticatedRpc(
  accessToken: string,
  functionName: string,
  data: Record<string, string>,
) {
  const { publishableKey, url } = getLocalSupabaseConfiguration();

  return fetchSensitiveUrl(`${url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
}

function isInviteResultRow(value: unknown): value is {
  public_id: string;
  raw_token: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "public_id" in value &&
    typeof value.public_id === "string" &&
    "raw_token" in value &&
    typeof value.raw_token === "string"
  );
}

function isJoinRequestResultRow(value: unknown): value is {
  request_id: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "request_id" in value &&
    typeof value.request_id === "string"
  );
}

async function createLeague(page: Page, name: string) {
  await page.goto("/leagues/new");
  await page.getByLabel("שם הליגה").fill(name);
  await page.getByRole("button", { name: "יצירת ליגה", exact: true }).click();
  await expect(page).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);

  const leagueId = new URL(page.url()).pathname.split("/").at(-1);
  expect(leagueId).toMatch(/^[0-9a-f-]{36}$/);
  return leagueId as string;
}

async function createSyntheticPng(red: number, green: number, blue: number) {
  return sharp({
    create: {
      width: 96,
      height: 64,
      channels: 3,
      background: { r: red, g: green, b: blue },
    },
  })
    .png()
    .toBuffer();
}

function getSecondaryContextOptions(
  projectName: string,
): BrowserContextOptions {
  const descriptor = projectName.startsWith("mobile-")
    ? devices["Pixel 5"]
    : devices["Desktop Chrome"];

  return {
    baseURL: "http://localhost:3000",
    deviceScaleFactor: descriptor.deviceScaleFactor,
    hasTouch: descriptor.hasTouch,
    isMobile: descriptor.isMobile,
    userAgent: descriptor.userAgent,
    viewport: descriptor.viewport,
  };
}

async function assertVisible(locator: Locator) {
  try {
    await locator.waitFor({ state: "visible" });

    if (!(await locator.isVisible())) {
      throw new Error();
    }
  } catch {
    throw new Error("Expected UI state was not visible.");
  }
}

async function assertLocatorCount(locator: Locator, expected: number) {
  try {
    if (expected === 0) {
      await locator.waitFor({ state: "hidden" });
    } else {
      await locator.nth(expected - 1).waitFor({ state: "visible" });
    }

    if ((await locator.count()) !== expected) {
      throw new Error();
    }
  } catch {
    throw new Error("Expected UI item count was not reached.");
  }
}

async function assertInviteSkipTarget(page: Page) {
  const skipLink = page.getByRole("link", { name: "דילוג לתוכן הראשי" });
  const mainTarget = page.locator("#main-content");

  await expect(skipLink).toHaveCount(1);
  await expect(mainTarget).toHaveCount(1);
  await page.locator("body").press("Home");
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect
    .poll(() =>
      skipLink.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
      }),
    )
    .toBe(true);
  await page.keyboard.press("Enter");
  await expect(mainTarget).toBeFocused();
}

async function navigateToInvite(page: Page, url: string) {
  const rawTokenMatch = new URL(url).hash.match(
    /^#invite=([A-Za-z0-9_-]{43})$/,
  );
  if (!rawTokenMatch) {
    throw new Error("Sensitive invite URL was malformed.");
  }

  const rawToken = rawTokenMatch[1];
  let rawTokenReachedNetwork = false;
  const observeRequest = (request: {
    headers(): Record<string, string>;
    postData(): string | null;
    url(): string;
  }) => {
    if (
      request.url().includes(rawToken) ||
      request.postData()?.includes(rawToken) ||
      Object.values(request.headers()).some((value) =>
        value.includes(rawToken),
      )
    ) {
      rawTokenReachedNetwork = true;
    }
  };
  page.on("request", observeRequest);

  try {
    // Playwright serializes page.goto targets into its HTML step report.
    // Navigate inside the browser so the invite bearer is never a step title.
    await page.evaluate((target) => window.location.assign(target), url);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(() => window.location.hash === "");
  } catch {
    throw new Error("Sensitive invite navigation failed.");
  } finally {
    page.off("request", observeRequest);
  }

  if (rawTokenReachedNetwork) {
    throw new Error("Invite bearer reached the network boundary.");
  }
}

async function fetchSensitiveUrl(url: string, init?: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error("Sensitive private-file request failed.");
  }
}

type ProofMultipart = {
  proof: {
    name: string;
    mimeType: string;
    buffer: Buffer;
  };
  idempotencyKey: string;
};

function createProofFormData(multipart: ProofMultipart) {
  const formData = new FormData();
  formData.append(
    "proof",
    new Blob([new Uint8Array(multipart.proof.buffer)], {
      type: multipart.proof.mimeType,
    }),
    multipart.proof.name,
  );
  formData.append("idempotencyKey", multipart.idempotencyKey);
  return formData;
}

async function fetchLocalRoute(
  context: BrowserContext | undefined,
  path: string,
  {
    method = "GET",
    origin,
    multipart,
    redirect = "manual",
  }: {
    method?: "GET" | "POST";
    origin?: string;
    multipart?: ProofMultipart;
    redirect?: RequestRedirect;
  } = {},
) {
  const headers = new Headers();

  if (origin) {
    headers.set("Origin", origin);
  }

  if (context) {
    const cookies = await context.cookies("http://localhost:3000");
    headers.set(
      "Cookie",
      cookies.map(({ name, value }) => `${name}=${value}`).join("; "),
    );
  }

  return fetchSensitiveUrl(new URL(path, "http://localhost:3000").toString(), {
    method,
    headers,
    body: multipart ? createProofFormData(multipart) : undefined,
    redirect,
  });
}

async function revokeActiveInviteForCleanup(
  accessToken: string,
  leagueId: string,
) {
  try {
    const metadataResponse = await callAuthenticatedRpc(
      accessToken,
      "get_league_invite_metadata",
      { p_league_id: leagueId },
    );

    if (!metadataResponse.ok) {
      return;
    }

    const payload = (await metadataResponse.json()) as unknown;
    const row = Array.isArray(payload) && payload.length === 1 ? payload[0] : null;

    if (
      typeof row !== "object" ||
      row === null ||
      !("status" in row) ||
      row.status !== "active" ||
      !("invite_id" in row) ||
      typeof row.invite_id !== "string"
    ) {
      return;
    }

    await callAuthenticatedRpc(accessToken, "revoke_invite", {
      p_invite_id: row.invite_id,
    });
  } catch {
    // Cleanup is best effort and deliberately emits no bearer or response data.
  }
}

test.describe("Slices 3 and 4 invite, proof, and manager decision", () => {
  test("handles an invite that expires between render and submission", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(10_000);
    const secondaryContextOptions = getSecondaryContextOptions(
      testInfo.project.name,
    );
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const password = `Aa1!${crypto.randomUUID()}`;
    const leagueName = `ליגת תפוגה ${suffix}`;
    let managerContext: BrowserContext | undefined;
    let requesterContext: BrowserContext | undefined;
    let cleanupPublicId: string | undefined;
    let primaryFailure: unknown;

    try {
      const manager = await registerConfirmedUser({
        browser,
        registrationPage: page,
        request,
        email: `slice3-expiry-manager-${suffix}@example.com`,
        password,
        displayName: "מנהלת בדיקת תפוגה",
        contextOptions: secondaryContextOptions,
      });
      managerContext = manager.context;

      const leagueId = await createLeague(manager.page, leagueName);
      await manager.page
        .getByRole("link", { name: "ניהול קישור ההזמנה" })
        .click();
      await expect(manager.page).toHaveURL(
        new RegExp(`/leagues/${leagueId}/settings$`),
      );
      await manager.page
        .getByRole("button", { name: "יצירת קישור חדש" })
        .click();
      const newInviteField = manager.page.getByLabel("הקישור החדש");
      const inviteSection = manager.page.getByRole("region", {
        name: "קישור חד־פעמי להצגה",
      });
      expect(
        await newInviteField.evaluate((element) => ({
          backgroundColor: getComputedStyle(element).backgroundColor,
          borderTopColor: getComputedStyle(element).borderTopColor,
        })),
      ).toEqual({
        backgroundColor: "rgb(255, 255, 255)",
        borderTopColor: "rgb(127, 144, 164)",
      });
      expect(
        await inviteSection.evaluate(
          (element) => ({
            backgroundColor: getComputedStyle(element).backgroundColor,
            borderInlineStartColor:
              getComputedStyle(element).borderInlineStartColor,
            borderInlineStartWidth:
              getComputedStyle(element).borderInlineStartWidth,
          }),
        ),
      ).toEqual({
        backgroundColor: "rgb(255, 255, 255)",
        borderInlineStartColor: "rgb(4, 120, 87)",
        borderInlineStartWidth: "4px",
      });
      const invite = await newInviteField.inputValue();
      const inviteUrl = new URL(invite);
      const publicId = inviteUrl.pathname.split("/").at(-1);
      expect(publicId).toMatch(/^[0-9a-f-]{36}$/);
      cleanupPublicId = publicId as string;

      requesterContext = await browser.newContext(secondaryContextOptions);
      const requesterRegistrationPage = await requesterContext.newPage();
      await navigateToInvite(requesterRegistrationPage, invite);
      await assertVisible(
        requesterRegistrationPage.getByRole("heading", { name: leagueName }),
      );
      const requester = await registerConfirmedUser({
        browser,
        registrationPage: requesterRegistrationPage,
        request,
        email: `slice3-expiry-requester-${suffix}@example.com`,
        password,
        displayName: "מבקש בדיקת תפוגה",
        nextPath: inviteUrl.pathname,
        confirmInRegistrationContext: true,
        contextOptions: secondaryContextOptions,
      });
      await assertVisible(
        requester.page.getByRole("heading", { name: leagueName }),
      );

      expireInviteInDisposableLocalDatabase(cleanupPublicId);
      await requester.page
        .getByRole("button", { name: "פתיחת בקשת הצטרפות" })
        .click();
      await assertVisible(
        requester.page.getByText("קישור ההזמנה אינו זמין.", { exact: true }),
      );
      await requester.page.reload();
      await assertVisible(
        requester.page.getByRole("heading", {
          name: "קישור ההזמנה אינו זמין",
        }),
      );

      await manager.page.reload();
      await assertVisible(manager.page.getByText("פג תוקף", { exact: true }));
      await assertVisible(
        manager.page.getByRole("button", { name: "יצירת קישור חדש" }),
      );
    } catch (error) {
      primaryFailure = error;
      throw error;
    } finally {
      let cleanupFailure: unknown;

      if (cleanupPublicId) {
        try {
          removeInviteFromDisposableLocalDatabase(cleanupPublicId);
        } catch (error) {
          cleanupFailure = error;
        }
      }

      await Promise.allSettled([
        requesterContext?.close(),
        managerContext?.close(),
      ]);

      if (cleanupFailure !== undefined && primaryFailure === undefined) {
        throw cleanupFailure;
      }
    }
  });

  test("rotates a one-time invite, resumes Auth, preserves proof history, and blocks IDOR", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(10_000);
    const secondaryContextOptions = getSecondaryContextOptions(
      testInfo.project.name,
    );
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const password = `Aa1!${crypto.randomUUID()}`;
    const managerEmail = `slice3-manager-${suffix}@example.com`;
    const requesterEmail = `slice3-requester-${suffix}@example.com`;
    const outsiderEmail = `slice3-outsider-${suffix}@example.com`;
    const otherManagerEmail = `slice3-other-manager-${suffix}@example.com`;
    const leagueName = `ליגת Slice 3 ${suffix}`;
    let cleanupAccessToken: string | undefined;
    let cleanupLeagueId: string | undefined;

    try {
    const manager = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: managerEmail,
      password,
      displayName: "מנהלת Slice 3",
      contextOptions: secondaryContextOptions,
    });
    manager.page.setDefaultTimeout(10_000);
    await manager.context.grantPermissions(
      ["clipboard-read", "clipboard-write"],
      { origin: "http://localhost:3000" },
    );
    let managerConsoleErrorCount = 0;
    manager.page.on("console", (message) => {
      if (message.type() === "error") {
        managerConsoleErrorCount += 1;
      }
    });
    manager.page.on("pageerror", () => {
      managerConsoleErrorCount += 1;
    });
    const leagueId = await createLeague(manager.page, leagueName);
    cleanupLeagueId = leagueId;
    const managerAccessToken = await signInForDataApi(
      managerEmail,
      password,
    );
    cleanupAccessToken = managerAccessToken;

    await manager.page.getByRole("link", { name: "ניהול קישור ההזמנה" }).click();
    await expect(manager.page).toHaveURL(
      new RegExp(`/leagues/${leagueId}/settings$`),
    );
    await manager.page
      .getByRole("button", { name: "יצירת קישור חדש" })
      .click();
    const firstInvite = await manager.page.getByLabel("הקישור החדש").inputValue();
    const firstInviteUrl = new URL(firstInvite);
    expect(firstInviteUrl.origin).toBe("http://localhost:3000");
    expect(/^\/invite\/[0-9a-f-]{36}$/.test(firstInviteUrl.pathname)).toBe(
      true,
    );
    expect(/^#invite=[A-Za-z0-9_-]{43}$/.test(firstInviteUrl.hash)).toBe(true);
    const firstInvitePublicId = firstInviteUrl.pathname.split("/").at(-1);
    const firstInviteToken = firstInviteUrl.hash.replace(/^#invite=/, "");

    await manager.page.getByRole("button", { name: "העתקת הקישור" }).click();
    await assertVisible(manager.page.getByText("הקישור הועתק ללוח."));
    const copiedInviteMatches = await manager.page.evaluate(
      async (expected) => (await navigator.clipboard.readText()) === expected,
      firstInvite,
    );
    expect(copiedInviteMatches).toBe(true);

    await manager.page.reload();
    await assertLocatorCount(manager.page.getByLabel("הקישור החדש"), 0);
    const rotateDisclosure = manager.page
      .locator("summary")
      .filter({ hasText: "החלפת הקישור הפעיל" });
    await assertVisible(rotateDisclosure);
    await rotateDisclosure.focus();
    expect(
      await rotateDisclosure.evaluate((element) => ({
        outlineColor: getComputedStyle(element).outlineColor,
        outlineWidth: getComputedStyle(element).outlineWidth,
      })),
    ).toEqual({
      outlineColor: "rgb(28, 78, 130)",
      outlineWidth: "2px",
    });

    // Exercise the database lock with genuinely simultaneous rotations. Both
    // calls succeed, while only the final token remains usable.
    const rotateInvite = () =>
      callAuthenticatedRpc(
        managerAccessToken,
        "create_or_rotate_invite",
        { p_league_id: leagueId },
      );
    const concurrentRotations = await Promise.all([
      rotateInvite(),
      rotateInvite(),
    ]);
    expect(concurrentRotations.map((response) => response.status)).toEqual([
      200,
      200,
    ]);
    const concurrentRotationPayloads = (await Promise.all(
      concurrentRotations.map((response) => response.json()),
    )) as unknown[];
    const concurrentInvites = concurrentRotationPayloads.map((payload) => {
      const rows = Array.isArray(payload) ? payload : [];
      const row = rows.length === 1 ? rows[0] : null;
      expect(isInviteResultRow(row)).toBe(true);
      return row as { public_id: string; raw_token: string };
    });
    expect(new Set(concurrentInvites.map((invite) => invite.raw_token)).size).toBe(2);
    expect(new Set(concurrentInvites.map((invite) => invite.public_id)).size).toBe(2);
    expect(
      concurrentInvites.every((invite) =>
        /^[A-Za-z0-9_-]{43}$/.test(invite.raw_token),
      ),
    ).toBe(true);

    const { publishableKey, url: supabaseUrl } =
      getLocalSupabaseConfiguration();
    const concurrentTokenHashes = await Promise.all(
      concurrentInvites.map((invite) => hashInviteToken(invite.raw_token)),
    );
    const concurrentResolutions = await Promise.all(
      concurrentTokenHashes.map((tokenHash, index) =>
        fetchSensitiveUrl(`${supabaseUrl}/rest/v1/rpc/resolve_invite`, {
          method: "POST",
          headers: {
            apikey: publishableKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_public_id: concurrentInvites[index]?.public_id,
            p_token_hash: tokenHash,
          }),
        }),
      ),
    );
    expect(concurrentResolutions.every((response) => response.ok)).toBe(true);
    const concurrentResolutionPayloads = (await Promise.all(
      concurrentResolutions.map((response) => response.json()),
    )) as unknown[];
    const availableAfterRace = concurrentResolutionPayloads.filter(
      (payload) =>
        Array.isArray(payload) &&
        payload.length === 1 &&
        typeof payload[0] === "object" &&
        payload[0] !== null &&
        "available" in payload[0] &&
        payload[0].available === true,
    );
    expect(availableAfterRace).toHaveLength(1);

    // Refresh the stale settings state before using the UI rotation path.
    await manager.page.reload();
    await manager.page
      .locator("summary")
      .filter({ hasText: "החלפת הקישור הפעיל" })
      .click();
    expect(managerConsoleErrorCount).toBe(0);
    expect(await manager.page.getByRole("button").allTextContents()).toContain(
      "אישור החלפת הקישור",
    );
    await manager.page
      .getByRole("button", { name: "אישור החלפת הקישור" })
      .click();
    const secondInvite = await manager.page.getByLabel("הקישור החדש").inputValue();
    const secondInviteUrl = new URL(secondInvite);
    const secondInvitePath = secondInviteUrl.pathname;
    const secondInvitePublicId = secondInvitePath.split("/").at(-1);
    const secondInviteToken = secondInviteUrl.hash.replace(/^#invite=/, "");
    expect(secondInvite !== firstInvite).toBe(true);

    await navigateToInvite(page, firstInvite);
    await assertVisible(
      page.getByRole("heading", { name: "קישור ההזמנה אינו זמין" }),
    );
    await assertInviteSkipTarget(page);
    const requesterRegistrationContext = await browser.newContext(
      secondaryContextOptions,
    );
    const requesterRegistrationPage = await requesterRegistrationContext.newPage();
    await navigateToInvite(requesterRegistrationPage, secondInvite);
    await assertVisible(
      requesterRegistrationPage.getByRole("heading", { name: leagueName }),
    );
    await assertInviteSkipTarget(requesterRegistrationPage);
    await assertVisible(
      requesterRegistrationPage.getByText("Demo בלבד — ללא כסף אמיתי"),
    );
    await assertLocatorCount(requesterRegistrationPage.getByText(managerEmail), 0);
    const loginHref = await requesterRegistrationPage
      .getByRole("link", { name: "התחברות והמשך" })
      .getAttribute("href");
    expect(
      loginHref === `/login?next=${encodeURIComponent(secondInvitePath)}`,
    ).toBe(true);
    const registrationHref = await requesterRegistrationPage
      .getByRole("link", { name: "יצירת חשבון" })
      .getAttribute("href");
    expect(
      registrationHref ===
        `/register?next=${encodeURIComponent(secondInvitePath)}`,
    ).toBe(true);

    const requester = await registerConfirmedUser({
      browser,
      registrationPage: requesterRegistrationPage,
      request,
      email: requesterEmail,
      password,
      displayName: "מבקש הצטרפות",
      nextPath: secondInvitePath,
      confirmInRegistrationContext: true,
      contextOptions: secondaryContextOptions,
    });
    requester.page.setDefaultTimeout(10_000);
    expect(new URL(requester.page.url()).pathname === secondInvitePath).toBe(
      true,
    );

    // A valid path-scoped cookie may already exist when the same share link is
    // opened again. The rendered invite must still scrub the raw fragment.
    await navigateToInvite(requester.page, secondInvite);
    await assertVisible(
      requester.page.getByRole("heading", { name: leagueName }),
    );
    await assertInviteSkipTarget(requester.page);
    await assertVisible(requester.page.getByRole("link", { name: "הליגות שלי" }));
    await assertVisible(requester.page.getByRole("button", { name: "התנתקות" }));

    // Two tabs submitting the same invite must converge on one request. A
    // subsequent submission with an older token remains an idempotent replay.
    const requesterAccessToken = await signInForDataApi(
      requesterEmail,
      password,
    );
    expect(
      typeof secondInvitePublicId === "string" &&
        /^[0-9a-f-]{36}$/.test(secondInvitePublicId) &&
        /^[A-Za-z0-9_-]{43}$/.test(secondInviteToken),
    ).toBe(true);
    const submitJoinRequest = async (publicId: string, token: string) =>
      callAuthenticatedRpc(
        requesterAccessToken,
        "submit_join_request",
        {
          p_public_id: publicId,
          p_token_hash: await hashInviteToken(token),
        },
      );
    const concurrentSubmissions = await Promise.all([
      submitJoinRequest(secondInvitePublicId as string, secondInviteToken),
      submitJoinRequest(secondInvitePublicId as string, secondInviteToken),
    ]);
    expect(concurrentSubmissions.every((response) => response.ok)).toBe(true);
    const concurrentSubmissionPayloads = (await Promise.all(
      concurrentSubmissions.map((response) => response.json()),
    )) as unknown[];
    const concurrentRequestIds = concurrentSubmissionPayloads.map((payload) => {
      const rows = Array.isArray(payload) ? payload : [];
      const row = rows.length === 1 ? rows[0] : null;
      expect(isJoinRequestResultRow(row)).toBe(true);
      return (row as { request_id: string }).request_id;
    });
    expect(new Set(concurrentRequestIds).size).toBe(1);

    const oldTokenReplay = await submitJoinRequest(
      firstInvitePublicId as string,
      firstInviteToken,
    );
    expect(oldTokenReplay.ok).toBe(true);
    const oldTokenReplayPayload = (await oldTokenReplay.json()) as unknown;
    const oldTokenReplayRows = Array.isArray(oldTokenReplayPayload)
      ? oldTokenReplayPayload
      : [];
    expect(oldTokenReplayRows).toHaveLength(1);
    expect(isJoinRequestResultRow(oldTokenReplayRows[0])).toBe(true);
    expect((oldTokenReplayRows[0] as { request_id: string }).request_id).toBe(
      concurrentRequestIds[0],
    );

    await requester.page
      .getByRole("button", { name: "פתיחת בקשת הצטרפות" })
      .click();
    await assertVisible(
      requester.page.getByRole("heading", { name: "הבקשה ממתינה לתמונת Demo" }),
    );

    const requestInput = requester.page.getByLabel(
      "תמונת Demo מסוג JPEG, PNG או WebP",
    );
    const inputId = await requestInput.getAttribute("id");
    const requestId = inputId?.replace("proof-file-", "");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);

    const firstProofBytes = await createSyntheticPng(40, 120, 210);
    const proofMultipart = (idempotencyKey = crypto.randomUUID()) => ({
      proof: {
        name: "synthetic-demo.png",
        mimeType: "image/png",
        buffer: firstProofBytes,
      },
      idempotencyKey,
    });
    const unauthenticatedUpload = await fetchLocalRoute(
      undefined,
      `/api/join-requests/${requestId as string}/proofs`,
      {
        method: "POST",
        origin: "http://localhost:3000",
        multipart: proofMultipart(),
      },
    );
    expect(unauthenticatedUpload.status).toBe(401);
    const hostileOriginUpload = await fetchLocalRoute(
      requester.context,
      `/api/join-requests/${requestId as string}/proofs`,
      {
        method: "POST",
        origin: "https://attacker.example",
        multipart: proofMultipart(),
      },
    );
    expect(hostileOriginUpload.status).toBe(403);
    const malformedRequestUpload = await fetchLocalRoute(
      requester.context,
      "/api/join-requests/not-a-uuid/proofs",
      {
        method: "POST",
        origin: "http://localhost:3000",
        multipart: proofMultipart(),
      },
    );
    expect(malformedRequestUpload.status).toBe(400);
    const managerCannotUpload = await fetchLocalRoute(
      manager.context,
      `/api/join-requests/${requestId as string}/proofs`,
      {
        method: "POST",
        origin: "http://localhost:3000",
        multipart: proofMultipart(),
      },
    );
    expect(managerCannotUpload.status).toBe(404);

    await requestInput.setInputFiles({
      name: "synthetic-demo.png",
      mimeType: "image/png",
      buffer: firstProofBytes,
    });
    await assertVisible(
      requester.page.getByAltText("תצוגה מקדימה של תמונת ה־Demo שנבחרה"),
    );
    await requester.page
      .getByRole("button", { name: "העלאת תמונת Demo", exact: true })
      .click();
    await assertVisible(
      requester.page.getByRole("heading", {
        name: "הבקשה ממתינה לבדיקת מנהל/ת הליגה",
      }),
    );
    await assertLocatorCount(
      requester.page.getByRole("link", { name: "צפייה בתמונת Demo" }),
      1,
    );

    await requester.page.goto("/dashboard");
    await assertVisible(
      requester.page.getByRole("heading", { name: "בקשות ההצטרפות שלי" }),
    );
    await assertVisible(requester.page.getByText(leagueName));
    await assertVisible(
      requester.page.getByText("ממתינה לבדיקת מנהל/ת הליגה", { exact: true }),
    );

    await manager.page.goto(`/leagues/${leagueId}/settings`);
    await manager.page
      .locator("summary")
      .filter({ hasText: "ביטול הקישור" })
      .click();
    await manager.page
      .getByRole("button", { name: "אישור ביטול הקישור" })
      .click();
    await assertVisible(manager.page.getByText("קישור ההזמנה בוטל."));

    const outsider = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: outsiderEmail,
      password,
      displayName: "משתמש מחוץ לליגה",
      contextOptions: secondaryContextOptions,
    });
    outsider.page.setDefaultTimeout(10_000);
    await navigateToInvite(outsider.page, secondInvite);
    await assertVisible(
      outsider.page.getByRole("heading", { name: "קישור ההזמנה אינו זמין" }),
    );
    await assertInviteSkipTarget(outsider.page);

    const otherManager = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: otherManagerEmail,
      password,
      displayName: "מנהל ליגה אחרת",
      contextOptions: secondaryContextOptions,
    });
    otherManager.page.setDefaultTimeout(10_000);
    await createLeague(otherManager.page, `ליגה זרה ${suffix}`);
    await navigateToInvite(otherManager.page, secondInvite);
    await assertVisible(
      otherManager.page.getByRole("heading", { name: "קישור ההזמנה אינו זמין" }),
    );

    // Revocation blocks new requests, but an existing undecided request may
    // upload a replacement. Two identical concurrent retries create one row.
    const retryKey = crypto.randomUUID();
    const retryBytes = await createSyntheticPng(180, 80, 60);
    const uploadRetry = () =>
      fetchLocalRoute(
        requester.context,
        `/api/join-requests/${requestId as string}/proofs`,
        {
          method: "POST",
          origin: "http://localhost:3000",
          multipart: {
            proof: {
              name: "synthetic-retry.png",
              mimeType: "image/png",
              buffer: retryBytes,
            },
            idempotencyKey: retryKey,
          },
        },
      );
    const [retryA, retryB] = await Promise.all([uploadRetry(), uploadRetry()]);
    expect([retryA.status, retryB.status].sort()).toEqual([200, 201]);
    const retryPayloads = await Promise.all([retryA.json(), retryB.json()]);
    const retryProofIds = retryPayloads.map(
      (payload: { data?: { proofId?: unknown } }) => payload.data?.proofId,
    );
    expect(typeof retryProofIds[0]).toBe("string");
    expect(new Set(retryProofIds).size).toBe(1);
    for (const payload of retryPayloads as {
      data: Record<string, unknown>;
    }[]) {
      expect(Object.keys(payload.data).sort()).toEqual([
        "proofId",
        "replayed",
        "requestId",
        "status",
      ]);
      expect(JSON.stringify(payload)).not.toContain("storage_path");
      expect(JSON.stringify(payload)).not.toContain("signedUrl");
    }

    await requester.page.goto("/dashboard");
    await assertLocatorCount(
      requester.page.getByRole("link", { name: "צפייה בתמונת Demo" }),
      2,
    );
    const replacementInput = requester.page.getByLabel(
      "תמונת Demo מסוג JPEG, PNG או WebP",
    );
    await replacementInput.setInputFiles({
      name: "synthetic-replacement.webp",
      mimeType: "image/webp",
      buffer: await sharp(await createSyntheticPng(70, 190, 90)).webp().toBuffer(),
    });
    await requester.page
      .getByRole("button", { name: "העלאת תמונת Demo חלופית" })
      .click();
    await assertLocatorCount(
      requester.page.getByRole("link", { name: "צפייה בתמונת Demo" }),
      3,
    );

    const rejectedMedia = await fetchLocalRoute(
      requester.context,
      `/api/join-requests/${requestId as string}/proofs`,
      {
        method: "POST",
        origin: "http://localhost:3000",
        multipart: {
          proof: {
            name: "synthetic-invalid.png",
            mimeType: "image/png",
            buffer: Buffer.from("<svg>synthetic</svg>"),
          },
          idempotencyKey: crypto.randomUUID(),
        },
      },
    );
    expect(rejectedMedia.status).toBe(415);
    const rateLimited = await fetchLocalRoute(
      requester.context,
      `/api/join-requests/${requestId as string}/proofs`,
      {
        method: "POST",
        origin: "http://localhost:3000",
        multipart: proofMultipart(),
      },
    );
    expect(rateLimited.status).toBe(429);
    expect(Number(rateLimited.headers.get("retry-after"))).toBeGreaterThan(0);

    const proofHref = await requester.page
      .getByRole("link", { name: "צפייה בתמונת Demo" })
      .first()
      .getAttribute("href");
    expect(proofHref).toMatch(/^\/api\/payment-proofs\/[0-9a-f-]{36}$/);
    const proofId = proofHref?.split("/").at(-1) as string;

    const ownerAccess = await fetchLocalRoute(
      requester.context,
      proofHref as string,
    );
    expect(ownerAccess.status).toBe(302);
    expect(ownerAccess.headers.get("cache-control")).toContain("no-store");
    expect(ownerAccess.headers.get("referrer-policy")).toBe("no-referrer");
    const signedUrl = ownerAccess.headers.get("location");
    expect(signedUrl).toBeTruthy();
    const signedToken = new URL(signedUrl as string).searchParams.get("token");
    expect(signedToken).toBeTruthy();
    const [, encodedPayload] = (signedToken as string).split(".");
    const tokenPayload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as { exp?: unknown; iat?: unknown };
    expect(typeof tokenPayload.exp).toBe("number");
    expect(typeof tokenPayload.iat).toBe("number");
    expect(
      (tokenPayload.exp as number) - (tokenPayload.iat as number),
    ).toBeLessThanOrEqual(60);
    let signedImage: globalThis.Response;
    try {
      signedImage = await fetch(signedUrl as string);
    } catch {
      throw new Error("Signed proof fetch failed.");
    }
    expect(signedImage.ok).toBe(true);
    expect(signedImage.headers.get("content-type")).toContain("image/webp");

    const managerAccess = await fetchLocalRoute(
      manager.context,
      proofHref as string,
    );
    expect(managerAccess.status).toBe(302);
    const outsiderAccess = await fetchLocalRoute(
      outsider.context,
      proofHref as string,
    );
    expect(outsiderAccess.status).toBe(404);
    const otherManagerAccess = await fetchLocalRoute(
      otherManager.context,
      proofHref as string,
    );
    expect(otherManagerAccess.status).toBe(404);

    await manager.page.goto(`/leagues/${leagueId}`);
    await manager.page
      .getByRole("link", { name: "ניהול בקשות הצטרפות" })
      .click();
    await expect(manager.page).toHaveURL(
      new RegExp(`/leagues/${leagueId}/members$`),
    );
    await assertVisible(manager.page.getByRole("heading", { name: "בקשות הצטרפות" }));
    await assertVisible(manager.page.getByRole("heading", { name: "מבקש הצטרפות" }));
    await assertLocatorCount(
      manager.page.getByRole("link", { name: "צפייה בתמונת Demo" }),
      3,
    );

    await otherManager.page.goto(`/leagues/${leagueId}/members`);
    await assertVisible(
      otherManager.page.getByRole("heading", { name: "הדף לא נמצא" }),
    );
    await assertLocatorCount(
      otherManager.page.getByRole("heading", { name: "מבקש הצטרפות" }),
      0,
    );

    await manager.page.getByRole("button", { name: "אישור וצירוף לליגה" }).click();
    const approvedRequestCard = manager.page.locator("article").filter({
      has: manager.page.getByRole("heading", { name: "מבקש הצטרפות" }),
    });
    await assertVisible(approvedRequestCard.getByText("אושרה", { exact: true }));

    const replayApprovals = await Promise.all([
      callAuthenticatedRpc(managerAccessToken, "approve_join_request", {
        p_request_id: requestId as string,
      }),
      callAuthenticatedRpc(managerAccessToken, "approve_join_request", {
        p_request_id: requestId as string,
      }),
    ]);
    expect(replayApprovals.every((response) => response.ok)).toBe(true);

    await requester.page.goto("/dashboard");
    await assertVisible(requester.page.getByText(leagueName, { exact: true }).first());
    await assertVisible(requester.page.getByText("אושרה", { exact: true }));

    const outsiderForbiddenUpload = await fetchLocalRoute(
      outsider.context,
      `/api/join-requests/${requestId as string}/proofs`,
      {
        method: "POST",
        origin: "http://localhost:3000",
        multipart: {
          proof: {
            name: "synthetic-idor.png",
            mimeType: "image/png",
            buffer: firstProofBytes,
          },
          idempotencyKey: crypto.randomUUID(),
        },
      },
    );
    expect(outsiderForbiddenUpload.status).toBe(404);

    const otherManagerForbiddenUpload = await fetchLocalRoute(
      otherManager.context,
      `/api/join-requests/${requestId as string}/proofs`,
      {
        method: "POST",
        origin: "http://localhost:3000",
        multipart: {
          proof: {
            name: "synthetic-idor.png",
            mimeType: "image/png",
            buffer: firstProofBytes,
          },
          idempotencyKey: crypto.randomUUID(),
        },
      },
    );
    expect(otherManagerForbiddenUpload.status).toBe(404);

    const accessToken = await signInForDataApi(
      requesterEmail,
      password,
    );
    const storageHeaders = {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    };
    const storagePath = `league/${leagueId}/request/${requestId as string}/${proofId}.webp`;
    const directList = await fetchSensitiveUrl(
      `${supabaseUrl}/storage/v1/object/list/payment-proofs`,
      {
        method: "POST",
        headers: { ...storageHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: "", limit: 100, offset: 0 }),
      },
    );
    expect(directList.status).toBe(200);
    expect(await directList.json()).toEqual([]);
    const directRead = await fetchSensitiveUrl(
      `${supabaseUrl}/storage/v1/object/authenticated/payment-proofs/${storagePath}`,
      { headers: storageHeaders },
    );
    expect(directRead.ok).toBe(false);
    const directWrite = await fetchSensitiveUrl(
      `${supabaseUrl}/storage/v1/object/payment-proofs/${storagePath}.new`,
      {
        method: "POST",
        headers: { ...storageHeaders, "Content-Type": "image/webp" },
        body: new Uint8Array(await sharp(firstProofBytes).webp().toBuffer()),
      },
    );
    expect(directWrite.ok).toBe(false);
    const directDelete = await fetchSensitiveUrl(
      `${supabaseUrl}/storage/v1/object/payment-proofs/${storagePath}`,
      { method: "DELETE", headers: storageHeaders },
    );
    expect(directDelete.ok).toBe(false);

    await manager.context.close();
    await requester.context.close();
    await outsider.context.close();
    await otherManager.context.close();
    } finally {
      if (cleanupAccessToken && cleanupLeagueId) {
        await revokeActiveInviteForCleanup(
          cleanupAccessToken,
          cleanupLeagueId,
        );
      }
    }
  });
});
