import { test, expect, type Browser, type Page } from "@playwright/test";
import { E2E_INVITE_CODE } from "./invite-code";
import { barcodePhotoPng } from "./ean13-png";

/**
 * Reading a barcode off a photo someone actually took.
 *
 * The existing test feeds the scanner an ideal barcode: crisp, black on
 * white, filling the frame. A phone never produces that. It produces a
 * picture of a packet on a table with the barcode a fraction of the width,
 * often turned on its side — and that is what "the photo doesn't work"
 * means.
 */

const BARCODE = "4006381333931";

async function signedInPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/register");
  await page.fill('input[name="name"]', "Scan Photo");
  await page.fill('input[name="email"]', `e2e_photo_${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "password123");
  await page.fill('input[name="invite"]', E2E_INVITE_CODE);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL("**/onboarding");
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Gym")');
  await page.click('button:has-text("Continue")');
  await page.fill('input[placeholder*="Riverside"]', "Test School");
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Finish setup")');
  await page.waitForTimeout(1200);
  return page;
}

async function sendPhoto(page: Page, buffer: Buffer) {
  await page.goto("/gym/scanner");
  await page.locator('input[name="barcode"]').fill("");
  await page.getByTestId("barcode-photo-input").setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer,
  });
}

test.describe.serial("a photo of a barcode", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await signedInPage(browser);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test("is read when the barcode is a third of the frame", async () => {
    await sendPhoto(page, barcodePhotoPng(BARCODE, { fraction: 0.33 }));
    await expect(page.locator('input[name="barcode"]')).toHaveValue(BARCODE, { timeout: 30_000 });
  });

  test("is read when the label is turned on its side", async () => {
    // How a label sits on a shelf, and how people photograph a bottle.
    await sendPhoto(page, barcodePhotoPng(BARCODE, { fraction: 0.33, rotated: true }));
    await expect(page.locator('input[name="barcode"]')).toHaveValue(BARCODE, { timeout: 30_000 });
  });

  test("is read when it is off to one side and smaller", async () => {
    await sendPhoto(page, barcodePhotoPng(BARCODE, { fraction: 0.22, at: { x: 0.35, y: 0.6 } }));
    await expect(page.locator('input[name="barcode"]')).toHaveValue(BARCODE, { timeout: 30_000 });
  });
});
