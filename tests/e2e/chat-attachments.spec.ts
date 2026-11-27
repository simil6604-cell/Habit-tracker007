import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { makeNoisyPng } from "./big-image";
import { E2E_INVITE_CODE } from "./invite-code";

/**
 * Attaching and speaking, from where the message is written.
 *
 * Asked for in one line: let me send a picture or a voice message right
 * beside the box. Both already existed — they were in the row of modes
 * above the conversation, next to "Speak answers" and the language picker,
 * which is where you look for how the chat behaves, not for how to send
 * this one thing. So this is about where they are, and what it proves is
 * that moving them did not break either of them.
 */

async function register(page: Page) {
  const email = `e2e_attach_${Date.now()}@example.com`;
  await page.goto("/register");
  await page.fill('input[name="name"]', "Attach Test");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "password123");
  await page.fill('input[name="invite"]', E2E_INVITE_CODE);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL("**/onboarding");
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("School")');
  await page.click('button:has-text("Continue")');
  await page.fill('input[placeholder*="Riverside"]', "Test School");
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Finish setup")');
  await page.waitForTimeout(1200);
}

test("the camera and the microphone sit in the row you type in", async ({ page }) => {
  await register(page);
  await page.goto("/school#school-ai");

  const row = page.locator('form:has(input[name="message"])').first();
  await expect(row).toBeVisible();

  // All three in the one row: attach, speak, type, send.
  await expect(row.getByTestId("attach")).toBeVisible();
  await expect(row.getByTestId("dictate")).toBeVisible();
  await expect(row.locator('input[name="message"]')).toBeVisible();
  await expect(row.getByRole("button", { name: "Send" })).toBeVisible();

  // Still reachable by the names the rest of the app calls them, which is
  // what every other test here already relies on.
  await expect(page.getByRole("button", { name: /^Dictate$/ })).toBeVisible();

  // And they fit on a phone without pushing the box off the screen.
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await row.locator('input[name="message"]').boundingBox();
  expect(box!.width).toBeGreaterThan(120);
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(scroll).toBeLessThanOrEqual(1);
});

test("a photo attached from that row is staged and sent with the question", async ({ page }) => {
  await register(page);
  await page.goto("/school#school-ai");

  // The button opens the hidden file input it has always used.
  await page.getByTestId("school-ai-photo-input").setInputFiles(
    path.join(__dirname, "..", "..", "public", "icons", "icon-192.png")
  );

  const staged = page.getByTestId("school-ai-staged");
  await expect(staged).toBeVisible({ timeout: 20_000 });
  await expect(staged.locator("img")).toHaveCount(1);

  // With a photo waiting, Send is live even with nothing typed: a picture
  // of a question is a question.
  await expect(page.locator('form:has(input[name="message"])').getByRole("button", { name: "Send" })).toBeEnabled();
});

test("the coach has its microphone in the same place", async ({ page }) => {
  await register(page);
  await page.goto("/coach");

  const row = page.locator('form:has(input[name="message"])').first();
  await expect(row).toBeVisible();
  await expect(row.getByTestId("coach-dictate")).toBeVisible();
  await expect(row.getByRole("button", { name: "Send" })).toBeVisible();
});

/** What the server kept, in bytes — the thing the AI will be handed. */
async function storedBytes(page: Page, src: string): Promise<number> {
  const stored = await page.request.get(src);
  expect(stored.status()).toBe(200);
  // Measured on the bytes: the route that serves an upload does not
  // promise a content-length header, and a missing one reads as zero.
  return (await stored.body()).byteLength;
}

/** The API's per-image limit is on the base64, which is four bytes per three. */
const SAFE_ON_THE_WIRE = 3_500_000;

test("a photo with a phone's dimensions is shrunk before it is uploaded", async ({ page }) => {
  /*
   * Reported as "Couldn't reach the AI service right now (the AI service
   * returned an error (400))" with a photo attached. The service was fine:
   * 4032x3024 is what a phone camera produces, the API reads at 2576 on the
   * long edge, and an image over its per-image limit is refused outright.
   */
  await register(page);
  await page.goto("/school#school-ai");

  const big = makeNoisyPng(4032, 3024);
  await page.getByTestId("school-ai-photo-input").setInputFiles({
    name: "IMG_1330.png",
    mimeType: "image/png",
    buffer: big,
  });

  const staged = page.getByTestId("school-ai-staged");
  await expect(staged).toBeVisible({ timeout: 45_000 });
  const src = await staged.locator("img").getAttribute("src");
  const length = await storedBytes(page, src!);

  expect(length).toBeLessThan(SAFE_ON_THE_WIRE);
  expect(length).toBeLessThan(big.byteLength / 4);
});

test("a photo small enough in pixels but too heavy in bytes is re-encoded", async ({ page }) => {
  // The other half of the rule. This one is well inside the long edge the
  // model reads at, so only its weight is wrong — and it would upload
  // perfectly well and then be refused by the API.
  await register(page);
  await page.goto("/school#school-ai");

  const heavy = makeNoisyPng(1300, 1000);
  expect(heavy.byteLength).toBeGreaterThan(SAFE_ON_THE_WIRE);

  await page.getByTestId("school-ai-photo-input").setInputFiles({
    name: "scan.png",
    mimeType: "image/png",
    buffer: heavy,
  });

  const staged = page.getByTestId("school-ai-staged");
  await expect(staged).toBeVisible({ timeout: 45_000 });
  const length = await storedBytes(page, (await staged.locator("img").getAttribute("src"))!);
  expect(length).toBeLessThan(SAFE_ON_THE_WIRE);
});

test("a photo that is already fine is left exactly as it is", async ({ page }) => {
  // Re-encoding a small clean PNG would cost quality and buy nothing.
  await register(page);
  await page.goto("/school#school-ai");

  const small = makeNoisyPng(600, 400);
  expect(small.byteLength).toBeLessThan(SAFE_ON_THE_WIRE);

  await page.getByTestId("school-ai-photo-input").setInputFiles({
    name: "diagram.png",
    mimeType: "image/png",
    buffer: small,
  });

  const staged = page.getByTestId("school-ai-staged");
  await expect(staged).toBeVisible({ timeout: 30_000 });
  const src = (await staged.locator("img").getAttribute("src"))!;
  expect(src.endsWith(".png"), src).toBe(true);
  expect(await storedBytes(page, src)).toBe(small.byteLength);
});
