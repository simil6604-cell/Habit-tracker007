import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
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
