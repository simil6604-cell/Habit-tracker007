import { test, expect } from "@playwright/test";
import { rmSync } from "node:fs";
import { E2E_INVITE_CODE } from "./invite-code";
import os from "node:os";
import path from "node:path";

/**
 * The check's whole reason to exist: a row that points at a file which is no
 * longer there. Here the file is deleted behind the app's back, which is
 * exactly what a deploy does to photos stored in the app directory.
 */
test("the setup card notices a photo whose file has been deleted", async ({ page }) => {
  const email = `e2e_missing_${Date.now()}@example.com`;
  const password = "password123";

  await page.goto("/register");
  await page.fill('input[name="name"]', "Missing Photo");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="invite"]', E2E_INVITE_CODE);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL("**/onboarding");
  await page.click('button:has-text("Continue")');
  // Wait for the focus step before clicking "School": the step before it has a
  // School toggle too, and clicking that one turns the domain off instead.
  await expect(page.getByText("Where does most of your effort go?")).toBeVisible();
  await page.click('button:has-text("School")');
  await page.click('button:has-text("Continue")');
  await page.fill('input[placeholder*="Riverside"]', "Test School");
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Finish setup")');
  await page.waitForURL("/");

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwACRgFxfyRfSwAAAABJRU5ErkJggg==",
    "base64"
  );
  await page.goto("/gym/history");
  await page.setInputFiles('input[name="photo"]', { name: "progress.png", mimeType: "image/png", buffer: png });
  await page.fill('input[name="caption"]', "Will be deleted");
  await page.getByRole("button", { name: "Add photo" }).click();
  await expect(page.getByText("Will be deleted")).toBeVisible();
  // The row AND the file: everything below depends on this account having one
  // real photo. Asserted here so a failed upload fails on the upload, instead
  // of surfacing later as a settings card that reports no photos and reads
  // like the card is broken.
  await expect(
    page.locator('img[src^="/uploads/"]'),
    "the uploaded photo is on the page, so the row exists and has a path"
  ).toHaveCount(1);

  await page.goto("/settings");
  await expect(page.getByTestId("check-photo-files")).toContainText(/where the app expects/);
  await page.goto("/gym/history");

  // Now take the file away, the way a deploy would — this account's file only.
  // Emptying the whole upload directory would take the other tests' photos
  // with it, and a test that breaks its neighbours is worse than no test.
  const src = await page.locator('img[src^="/uploads/"]').first().getAttribute("src");
  const [, , owner, filename] = (src ?? "").split("/");
  expect(owner, "the photo is served from this account's own folder").toBeTruthy();
  rmSync(path.join(os.tmpdir(), "momentum-e2e-uploads", owner, filename));

  await page.goto("/settings");
  await expect(page.getByTestId("check-photo-files")).toContainText(/missing from disk/);
  await expect(page.getByTestId("setup-checks")).toContainText(/needs fixing now/);
});
