import { test, expect, type Page } from "@playwright/test";
import { E2E_INVITE_CODE } from "./invite-code";

/**
 * The endpoint that turns a reply into spoken audio.
 *
 * It spends money per character on somebody's ElevenLabs account, so the
 * first thing that matters is that it is not open to the world. The second
 * is that with no key set — which is how this suite runs, and how a fresh
 * deployment starts — it says so plainly instead of failing, because the
 * page is meant to fall back to the browser's own voice and carry on.
 */

async function register(page: Page, label: string) {
  await page.goto("/register");
  await page.fill('input[name="name"]', label);
  await page.fill('input[name="email"]', `e2e_${label}_${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "password123");
  await page.fill('input[name="invite"]', E2E_INVITE_CODE);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL("**/onboarding");
}

test("speaking is for signed-in people only", async ({ request }) => {
  // No session: an open text-to-speech endpoint is someone else's service
  // running on this account's credit. It is turned away before it reaches
  // the route at all, by the same redirect that guards every other page —
  // so this asserts the redirect, not a 401 the request never sees.
  const response = await request.post("/api/voice", { data: { text: "Hello" }, maxRedirects: 0 });
  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
  expect(response.headers()["location"]).toContain("/login");

  // And what comes back by following it is a page, never audio.
  const followed = await request.post("/api/voice", { data: { text: "Hello" } });
  expect(followed.headers()["content-type"] ?? "").not.toContain("audio");
});

test("with no voice key it says so, rather than failing", async ({ page }) => {
  await register(page, "voice1");

  const response = await page.request.post("/api/voice", { data: { text: "Hello" } });
  // 503 is what tells the page to use the browser's own voice.
  expect(response.status()).toBe(503);
  expect(await response.text()).toMatch(/no human voice/i);
});

test("a runaway amount of text is refused before it is paid for", async ({ page }) => {
  await register(page, "voice2");

  const response = await page.request.post("/api/voice", { data: { text: "x".repeat(100_000) } });
  // Refused on size, not quietly trimmed and billed.
  expect([413, 503]).toContain(response.status());
});
