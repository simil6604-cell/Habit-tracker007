import { test, expect } from "@playwright/test";
import { rmSync } from "node:fs";
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
  await expect(page.getByTestId("setup-checks")).toContainText(/lose data/);
});
