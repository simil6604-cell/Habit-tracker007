import { test, expect, type Page } from "@playwright/test";
import { E2E_INVITE_CODE } from "./invite-code";

/**
 * The Google Classroom connection, as far as it can be driven without a real
 * school account: what the app says when it is not set up, and — the one that
 * matters most — what it says when Google refuses.
 *
 * A student pointing this at a school account is likely to be told no by their
 * Workspace administrator. That refusal arrives as a redirect carrying an
 * error code, and the whole point of the handling is that it must not land as
 * a blank page or a silent failure.
 */

async function register(page: Page, label: string) {
  await page.goto("/register");
  await page.fill('input[name="name"]', label);
  await page.fill('input[name="email"]', `e2e_${label}_${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "password123");
  await page.fill('input[name="invite"]', E2E_INVITE_CODE);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL("**/onboarding");
  await page.click('button:has-text("Continue")');
  await expect(page.getByText("Where does most of your effort go?")).toBeVisible();
  await page.click('button:has-text("School")');
  await page.click('button:has-text("Continue")');
  await page.fill('input[placeholder*="Riverside"]', "Test School");
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Finish setup")');
  await page.waitForURL("/");
}

test.describe("google classroom", () => {
  test("says it is not set up, instead of offering a button that cannot work", async ({ page }) => {
    await register(page, "gc1");
    await page.goto("/settings");

    const card = page.getByTestId("google-unconfigured");
    await expect(card).toBeVisible();
    // The test server runs with no Google credentials, which is also the
    // state of a fresh deployment — it must name what is missing.
    await expect(card).toContainText("GOOGLE_CLIENT_ID");
    await expect(page.getByTestId("google-connect")).toBeDisabled();
  });

  test("starting the flow without credentials comes back saying so", async ({ page }) => {
    await register(page, "gc2");
    await page.goto("/api/google/start");

    await expect(page).toHaveURL(/\/settings\?google=unconfigured/);
    await expect(page.getByTestId("google-callback-message")).toContainText("no Google credentials");
  });

  test("a refusal by the school's administrator is explained, not swallowed", async ({ page }) => {
    await register(page, "gc3");
    // Exactly what Google sends back when a Workspace blocks outside apps.
    await page.goto("/api/google/callback?error=admin_policy_enforced&state=whatever");

    await expect(page).toHaveURL(/\/settings\?google=ADMIN_BLOCKED/);
    const message = page.getByTestId("google-callback-message");
    await expect(message).toContainText(/school/i);
    await expect(message).toContainText(/administrator/i);
    // The student must not be left thinking a retry will help.
    await expect(message).toContainText(/nothing in this app can get around it/i);
  });

  test("a cancelled consent says both of the things it can mean", async ({ page }) => {
    await register(page, "gc4");
    await page.goto("/api/google/callback?error=access_denied&state=whatever");

    const message = page.getByTestId("google-callback-message");
    await expect(message).toContainText(/cancelled/i);
    await expect(message).toContainText(/administrator/i);
  });

  test("a callback that did not come from here is refused", async ({ page }) => {
    await register(page, "gc5");
    // No state cookie was ever set, so this is not a flow this browser began.
    await page.goto("/api/google/callback?code=some-code&state=forged");

    await expect(page).toHaveURL(/\/settings\?google=BAD_STATE/);
    await expect(page.getByTestId("google-callback-message")).toContainText(/refused/i);
  });

  test("neither route does anything for someone who is not signed in", async ({ page, context }) => {
    await context.clearCookies();
    for (const path of ["/api/google/start", "/api/google/callback?code=x&state=y"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login/);
    }
  });
});
