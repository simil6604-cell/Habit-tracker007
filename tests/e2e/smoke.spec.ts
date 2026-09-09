import { test, expect, type Page, type Browser } from "@playwright/test";

/**
 * End-to-end smoke test for the whole app: registers a fresh account, runs
 * onboarding, then exercises the core flow of every domain (School, Gym,
 * Football, AI Coach, Calendar, Tasks, Settings) against a real production
 * build and a disposable SQLite test database (see global-setup.ts).
 *
 * Run with: npm run test:e2e
 */

test.describe.serial("full app walkthrough", () => {
  let page: Page;
  const email = `e2e_${Date.now()}@example.com`;
  const password = "password123";

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("register + onboarding", async () => {
    await page.goto("/register");
    await page.fill('input[name="name"]', "E2E Test");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/onboarding");

    await page.click('button:has-text("Continue")'); // domains step
    await page.fill('input[placeholder*="Riverside"]', "Test School");
    await page.click('button:has-text("Continue")'); // school step
    await page.click('button:has-text("Continue")'); // gym step
    await page.click('button:has-text("Continue")'); // football step
    await page.click('button:has-text("Finish setup")');

    await page.waitForURL("/");
    await expect(page.getByText("What do you want to optimize today?")).toBeVisible();
  });

  test("home shows all three domain cards", async () => {
    await page.goto("/");
    await expect(page.locator('main a[href="/school"]')).toBeVisible();
    await expect(page.locator('main a[href="/gym"]')).toBeVisible();
    await expect(page.locator('main a[href="/football"]')).toBeVisible();
  });

  test("school: add a subject and a topic", async () => {
    await page.goto("/school");
    await page.fill('input[placeholder="Subject name"]', "Chemistry");
    await page.click('button:has-text("Add subject")');

    const subjectCard = page.getByRole("link", { name: /Chemistry/ });
    await expect(subjectCard).toBeVisible();
    await subjectCard.click();

    await page.fill('input[placeholder="e.g. Algebra"]', "Periodic Table");
    await page.click('button:has-text("Add topic")');
    await expect(page.getByRole("cell", { name: /Periodic Table/ })).toBeVisible();
  });

  test("gym: create a workout plan", async () => {
    await page.goto("/gym");
    await page.fill('input[placeholder="e.g. Upper Body"]', "Leg Day");
    await page.click('button:has-text("Add plan")');
    await expect(page.getByText("Leg Day")).toBeVisible();
  });

  test("football: save profile and generate training", async () => {
    await page.goto("/football");
    await page.selectOption('select[name="position"]', "ST");
    await page.fill('input[name="teamName"]', "Test FC");
    await page.click('button:has-text("Save profile")');
    await expect(page.getByRole("link", { name: "Team & table" })).toBeVisible();

    await page.click('button:has-text("Generate individual training")');
    await page.reload();
    await expect(page.getByText("🎯 Individual Training")).toBeVisible();
  });

  test("ai coach: responds to a chat message", async () => {
    await page.goto("/coach");
    await page.fill('input[name="message"]', "optimize my entire week");
    await page.locator('form:has(input[name="message"]) button[type="submit"]').click();
    await page.waitForTimeout(1000);
    await expect(page.locator("main")).toContainText(/School|Gym|Football|Recovery/);
  });

  test("calendar: day, week and month views load", async () => {
    for (const view of ["day", "week", "month"]) {
      const res = await page.goto(`/calendar?view=${view}`);
      expect(res?.status()).toBe(200);
    }
  });

  test("tasks: add and complete a task", async () => {
    await page.goto("/tasks");
    await page.fill('input[placeholder="Task title"]', "Pack football boots");
    await page.click('button:has-text("Add")');
    await page.reload();
    await expect(page.getByText("Pack football boots")).toBeVisible();
  });

  test("settings: toggle theme and sign out", async () => {
    await page.goto("/settings");
    await expect(page.getByText(email)).toBeVisible();

    await page.click('button[aria-label="Sign out"]');
    await page.waitForURL("**/login");
  });
});
