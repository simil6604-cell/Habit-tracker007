import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { E2E_INVITE_CODE } from "./invite-code";

/**
 * Correcting a plan after it has been written.
 *
 * Reported in one line, with a screenshot of the run-up: "in diesem Bereich
 * kann ich nichts bearbeiten oder löschen". The page was read-only — the
 * plan as the AI first wrote it, for ever — and a plan you cannot correct
 * is one you stop opening. A day that was covered in class, two hours that
 * do not exist on a Thursday, a whole plan built for the wrong exam.
 *
 * The plan is put straight into the database: building one needs the AI
 * key, which this suite deliberately runs without, and what is tested here
 * is the editing.
 */

function testPrisma() {
  return new PrismaClient({
    datasources: { db: { url: `file:${path.join(__dirname, "..", "..", "prisma", "test.db")}` } },
  });
}

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Three days of run-up, starting today, and the plan they belong to. */
async function aPlanFor(email: string) {
  const prisma = testPrisma();
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const days = [0, 1, 2].map((offset) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + offset);
      return date;
    });
    const plan = await prisma.examPlan.create({
      data: {
        userId: user.id,
        title: "Economics Paper 2",
        examDate: days[2],
        brief: "Behind on the price system",
        days: {
          create: days.map((date, i) => ({
            date,
            focus: `Day ${i + 1}: price system`,
            detail: "Redraw the diagrams, then one timed data response.",
            minutes: 120,
          })),
        },
      },
    });
    return { planId: plan.id, keys: days.map(iso) };
  } finally {
    await prisma.$disconnect();
  }
}

async function register(page: Page): Promise<string> {
  const email = `e2e_planedit_${Date.now()}@example.com`;
  await page.goto("/register");
  await page.fill('input[name="name"]', "Plan Edit");
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
  return email;
}

test("a day can be rewritten, and the change survives a reload", async ({ page }) => {
  const email = await register(page);
  const { planId, keys } = await aPlanFor(email);

  await page.goto(`/school/plan/${planId}`);
  await expect(page.getByTestId("exam-plan-days").locator("li")).toHaveCount(3);

  await page.getByTestId(`edit-plan-day-${keys[0]}`).click();
  const form = page.getByTestId(`edit-plan-day-form-${keys[0]}`);
  await form.locator('input[name="focus"]').fill("Elastizität — Diagramme auf Englisch");
  await form.locator('textarea[name="detail"]').fill("Nur eine Stunde, zu Hause.");
  await form.locator('input[name="minutes"]').fill("60");
  await page.getByTestId(`save-plan-day-${keys[0]}`).click();

  await expect(page.getByText("Elastizität — Diagramme auf Englisch")).toBeVisible();
  await expect(page.getByText("Nur eine Stunde, zu Hause.")).toBeVisible();
  await expect(page.getByText("60 min").first()).toBeVisible();

  // Written, not just shown: the page is loaded again from the database.
  await page.reload();
  await expect(page.getByText("Elastizität — Diagramme auf Englisch")).toBeVisible();
  await expect(page.getByText("Day 1: price system")).toHaveCount(0);
});

test("nine thousand minutes of revision never reaches the plan", async ({ page }) => {
  const email = await register(page);
  const { planId, keys } = await aPlanFor(email);

  await page.goto(`/school/plan/${planId}`);
  await page.getByTestId(`edit-plan-day-${keys[0]}`).click();
  const form = page.getByTestId(`edit-plan-day-form-${keys[0]}`);
  const minutes = form.locator('input[name="minutes"]');
  // The box can be typed into, so it is: the day is capped at three hours
  // and the browser refuses the submit rather than storing a number nobody
  // could follow. The server clamps it too, in case the browser does not —
  // that half is pinned in tests/unit/exam-plan.test.ts.
  await expect(minutes).toHaveAttribute("max", "180");
  await minutes.fill("9000");
  await page.getByTestId(`save-plan-day-${keys[0]}`).click();

  // Nothing was saved and nothing was lost: the editor is still open with
  // what was typed, and the day still says what it said.
  await expect(form).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("9000 min")).toHaveCount(0);
  await expect(page.getByText("120 min").first()).toBeVisible();
});

test("a day can be taken off the plan, and asks before it goes", async ({ page }) => {
  const email = await register(page);
  const { planId, keys } = await aPlanFor(email);

  await page.goto(`/school/plan/${planId}`);
  const rows = page.getByTestId("exam-plan-days").locator("li");
  await expect(rows).toHaveCount(3);

  // One tap arms it and removes nothing — a thumb lands near a bin on a
  // phone, and there is no undo behind this.
  await page.getByTestId(`delete-plan-day-${keys[1]}`).click();
  await expect(rows).toHaveCount(3);

  await page.getByTestId(`confirm-delete-${keys[1]}`).click();
  await expect(rows).toHaveCount(2);

  await page.reload();
  await expect(page.getByTestId("exam-plan-days").locator("li")).toHaveCount(2);
  // The right one went.
  await expect(page.getByTestId(`plan-day-${keys[1]}`)).toHaveCount(0);
  await expect(page.getByTestId(`plan-day-${keys[0]}`)).toBeVisible();
});

test("the whole plan can be deleted, and asks first", async ({ page }) => {
  const email = await register(page);
  const { planId } = await aPlanFor(email);

  await page.goto(`/school/plan/${planId}`);
  await page.getByTestId("delete-plan").click();
  // It says what the difference is before the second tap, because Archive
  // is right next to it and keeps everything.
  await expect(page.getByText(/Archive keeps all of it/)).toBeVisible();

  await page.getByTestId("confirm-delete-plan").click();
  await page.waitForURL("**/school", { timeout: 15_000 });

  // Gone for good, not hidden: the page it was on is a 404 now.
  const response = await page.goto(`/school/plan/${planId}`);
  expect(response?.status()).toBe(404);
});

test("ticking a day still works, and a failure does not kill the page", async ({ page }) => {
  const email = await register(page);
  const { planId, keys } = await aPlanFor(email);

  await page.goto(`/school/plan/${planId}`);
  await page.getByTestId(`plan-day-${keys[0]}`).click();
  await expect(page.getByText(/1 of 3 days done/)).toBeVisible();

  // The same failure the School page was dying from: the action's own
  // request never arrives.
  await page.route("**/school/plan/**", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"] !== undefined) {
      await route.abort("failed");
      return;
    }
    await route.fallback();
  });
  await page.getByTestId(`delete-plan-day-${keys[2]}`).click();
  await page.getByTestId(`confirm-delete-${keys[2]}`).click();

  await expect(page.getByText(/didn't get through/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/This page didn't load/)).toHaveCount(0);
  await expect(page.getByTestId("exam-plan-days")).toBeVisible();
});
