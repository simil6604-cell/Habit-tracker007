import { test, expect, type Browser, type Page } from "@playwright/test";
import { E2E_INVITE_CODE } from "./invite-code";
import { BEAUTY_BARCODE, FOOD_BARCODE, UNKNOWN_BARCODE } from "./off-stub";

/**
 * Scanning a product, end to end.
 *
 * Asked for directly: does the product part actually work? The camera half
 * belongs to the phone, but everything after it is this app's — which
 * databases are asked, what is believed back, what is scored and what is
 * honestly left unscored — and that is what runs here, against stand-in
 * databases on localhost so the answer does not depend on anyone's servers.
 */

async function signedInPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/register");
  await page.fill('input[name="name"]', "Scan Test");
  await page.fill('input[name="email"]', `e2e_scan_${Date.now()}@example.com`);
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
  await page.waitForTimeout(1500);
  return page;
}

async function scan(page: Page, barcode: string) {
  await page.goto("/gym/scanner");
  await page.fill('input[name="barcode"]', barcode);
  await page.getByRole("button", { name: /^Look up$/ }).click();
}

test.describe.serial("the product scanner", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await signedInPage(browser);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test("looks a food barcode up, scores it, and keeps it", async () => {
    await scan(page, FOOD_BARCODE);

    await expect(page.getByText("Nutella").first()).toBeVisible();
    await expect(page.getByText("Ferrero").first()).toBeVisible();
    // The score is this app's own, computed from Nutri-Score E, NOVA 4 and
    // two additives — all of which came from the database, none invented.
    await expect(page.getByText(/Nutri-Score E/i)).toBeVisible();
    await expect(page.getByText(/ultra-processed/i)).toBeVisible();

    // And it is in the history, which is what makes it a scanner rather
    // than a lookup.
    await expect(page.getByRole("heading", { name: "Scan history" })).toBeVisible();
    await expect(page.locator("li", { hasText: "Nutella" }).first()).toBeVisible();
  });

  test("finds a cosmetic in the other database, and refuses to score it", async () => {
    // The old version only ever asked the food database, so a shampoo came
    // back as "no product found" — which reads as a broken scanner.
    await scan(page, BEAUTY_BARCODE);

    await expect(page.getByText("Nivea Shampoo").first()).toBeVisible();
    await expect(page.getByText(/Open Beauty Facts/).last()).toBeVisible();
    // No 0-100 number: it is built from Nutri-Score, NOVA and additives,
    // and putting one next to a shampoo would be a health claim.
    await expect(page.getByText(/doesn't apply|doesn’t apply/i)).toBeVisible();
    await expect(page.locator("li", { hasText: "Nivea Shampoo" }).first()).toContainText(/not scored/i);
  });

  test("says plainly when neither database has the barcode", async () => {
    await scan(page, UNKNOWN_BARCODE);
    await expect(page.getByText(/Neither Open Food Facts nor Open Beauty Facts/i)).toBeVisible();
    // Not "couldn't reach": being reached and not knowing a product is a
    // different problem with a different fix, and saying the wrong one
    // sends someone to check a connection that is fine.
    await expect(page.getByText(/couldn't reach/i)).toHaveCount(0);
  });

  test("takes the code typed the way the packet prints it", async () => {
    // An EAN-13 is printed with gaps — "3017 6204 22003" — and that is what
    // anyone copying it off a packet types. It used to be refused as "not a
    // barcode", which is true of the string and false of the barcode.
    await page.goto("/gym/scanner");
    await page.fill('input[name="barcode"]', "3017 6204 22003");
    await page.getByRole("button", { name: /^Look up$/ }).click();
    await expect(page.getByText("Nutella").first()).toBeVisible();
  });

  test("refuses something that is not a barcode without asking anyone", async () => {
    await scan(page, "../../etc/passwd");
    await expect(page.getByText(/is not a barcode/i)).toBeVisible();
  });

  test("can say whether it can reach the databases at all", async () => {
    // The question people actually mean by "the scanner doesn't work": is
    // it this barcode, or can the app not get out at all?
    await page.goto("/gym/scanner");
    await page.getByRole("button", { name: /Test the product database/i }).click();
    await expect(page.getByTestId("product-db-check")).toContainText(/Nutella/);
    await expect(page.getByTestId("product-db-check")).toContainText(/Scanning works/i);
  });
});
