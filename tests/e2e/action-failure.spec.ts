import { test, expect, type Page } from "@playwright/test";
import { E2E_INVITE_CODE } from "./invite-code";

/**
 * A button that fails must not take the page with it.
 *
 * Reported as "bei school ai wenn ich sage build a plan funktioniert es
 * nicht, stürzt ab", and reproduced: the plan builder called its server
 * action inside a transition with nothing around it, so anything thrown
 * became an unhandled rejection, reached the error boundary, and replaced
 * the whole School page with "This page didn't load" — the chat, the exams
 * and the homework list gone, because one button did not work.
 *
 * The failure is produced here the way it happens in life rather than by
 * mocking a module: the server action's own request is aborted, which is
 * what a lost signal, a restarting server and a deploy landing mid-tap all
 * look like from the browser. Nothing in the app knows it is a test.
 */

/** Kills the next server-action POST and nothing else: navigation still works. */
async function breakTheNextAction(page: Page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const isAction = request.method() === "POST" && request.headers()["next-action"] !== undefined;
    if (!isAction) return route.fallback();
    await route.abort("failed");
  });
}

async function register(page: Page) {
  const email = `e2e_fail_${Date.now()}@example.com`;
  await page.goto("/register");
  await page.fill('input[name="name"]', "Failure Test");
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

const DEAD_PAGE = /This page didn't load/;

test("a plan that cannot be built says so, instead of killing the School page", async ({ page }) => {
  await register(page);

  // An exam three weeks out, so there is a real run-up to ask for.
  const examDate = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  await page.goto("/school");
  const examForm = page.locator('form:has(input[placeholder="Exam title"])');
  await examForm.locator('input[name="title"]').fill("Biology Paper 2");
  await examForm.locator('input[name="date"]').fill(examDate);
  await examForm.locator('button[type="submit"]').click();
  await expect(page.getByText("Biology Paper 2").first()).toBeVisible();

  // Reloaded rather than navigated: the router can serve the copy of this
  // page it rendered before the exam existed, and the builder offers no
  // exams on that copy — a flake, and nothing to do with what is tested
  // here.
  await page.goto("/school");
  await page.reload();
  const openBuilder = page.getByTestId("open-plan-builder");
  await expect(openBuilder).toBeVisible({ timeout: 15_000 });
  await openBuilder.click();
  await expect(page.getByTestId("plan-exam-select")).toContainText("Biology Paper 2");
  await page.getByTestId("plan-brief").fill("Behind on osmosis");

  await breakTheNextAction(page);
  await page.getByRole("button", { name: "Build it" }).click();

  // A sentence in the panel, and the panel is still there.
  await expect(page.getByTestId("plan-builder")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/didn't get through/i)).toBeVisible();
  await expect(page.getByText(/[Nn]othing was saved/)).toBeVisible();
  // What was typed is still typed: nobody retypes a brief because a button
  // failed.
  await expect(page.getByTestId("plan-brief")).toHaveValue("Behind on osmosis");

  // The page itself is alive — this is the whole point.
  await expect(page.getByText(DEAD_PAGE)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Build it" })).toBeEnabled();
});

test("a question that cannot be sent goes back in the box, instead of killing the School page", async ({ page }) => {
  await register(page);
  await page.goto("/school#school-ai");

  const form = page.locator('form:has(input[name="message"])');
  await form.locator('input[name="message"]').fill("Baue mir einen Lernplan für Biologie");

  await breakTheNextAction(page);
  await form.locator('button[type="submit"]').click();

  await expect(page.getByText(/didn't get through/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(DEAD_PAGE)).toHaveCount(0);
  // Typed again for them, not by them.
  await expect(form.locator('input[name="message"]')).toHaveValue("Baue mir einen Lernplan für Biologie");
  // And the question that never arrived is not left sitting in the thread
  // looking as though it did.
  await expect(page.getByText("Baue mir einen Lernplan für Biologie", { exact: true })).toHaveCount(0);
});

test("a button that fails anywhere says so at the bottom, and the page lives", async ({ page }) => {
  /*
   * The one that was reported as "Website gecrashed". It is not one page's
   * problem: nearly every button in this app ran a server action inside a
   * transition, and a rejection in there reaches the error boundary and
   * takes the whole route with it. Tested here on a page that has nothing
   * to do with the chat or the plan, because the fix had to be the kind
   * that covers the pages nobody has reported yet.
   */
  await register(page);
  await page.goto("/gym");

  // A glass of water: about the smallest button in the app, on a page with
  // nothing to do with anything that has been reported.
  const glass = page.getByTitle("Add a glass (250ml)").first();
  await expect(glass).toBeVisible({ timeout: 15_000 });

  await breakTheNextAction(page);
  await glass.click();

  // The line at the bottom of the app, and the page still underneath it.
  await expect(page.getByTestId("action-failure")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(DEAD_PAGE)).toHaveCount(0);
  await expect(page.getByText("Goal:")).toBeVisible();

  // And it can be put away without reloading anything.
  await page.getByTestId("action-failure").getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByTestId("action-failure")).toHaveCount(0);
});
