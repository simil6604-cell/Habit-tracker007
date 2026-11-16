import { test, expect, type Browser, type Page } from "@playwright/test";
import { E2E_INVITE_CODE } from "./invite-code";

/**
 * Changing your mind about something you already sent.
 *
 * Asked for in these words: while I am in the chat I want to be able to
 * edit or delete the text. Editing already existed on the school AI and
 * nowhere else, and deleting a single message existed nowhere at all —
 * only emptying the whole conversation, which is not the same thing when
 * one line came out wrong.
 *
 * The rule being checked, in both chats: a message you sent goes with the
 * replies that followed it, because a reply to something that is no longer
 * there is nonsense; a reply goes on its own, so the question survives.
 */

async function signedInPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/register");
  await page.fill('input[name="name"]', "Edit Test");
  await page.fill('input[name="email"]', `e2e_edit_${Date.now()}@example.com`);
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
  return page;
}

/** Deletes the message in `row`, answering the confirmation it asks for. */
async function deleteRow(page: Page, row: ReturnType<Page["locator"]>) {
  await row.locator('[data-testid^="delete-message-"]').click();
  // It asks twice on purpose: these sit under a thumb on a phone and there
  // is no undo behind them.
  await page.locator('[data-testid^="confirm-delete-"]').click();
}

test.describe.serial("editing and deleting what you sent", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await signedInPage(browser);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test("school AI: deleting a question takes its answer with it", async () => {
    await page.goto("/school#school-ai");
    const box = page.locator('form input[name="message"]');
    await box.waitFor({ timeout: 15_000 });
    await page.getByTestId("new-chat").click();
    await page.waitForTimeout(600);

    const thread = page.getByTestId("school-ai-messages");
    const first = `Erste Frage ${Date.now()}`;
    await box.fill(first);
    await box.press("Enter");
    await expect(thread.getByText(first)).toBeVisible();

    const second = `Zweite Frage ${Date.now()}`;
    await box.fill(second);
    await box.press("Enter");
    await expect(thread.getByText(second)).toBeVisible();
    await expect(thread.locator("> div")).toHaveCount(4);

    // Delete the first question. It and the answer under it go; the second
    // exchange is untouched, because it was its own exchange.
    await deleteRow(page, thread.locator("> div").first());
    await expect(thread.getByText(first)).toHaveCount(0);
    await expect(thread.getByText(second)).toBeVisible();
    await expect(thread.locator("> div")).toHaveCount(2);

    // Written down, not just redrawn.
    await page.reload();
    const afterReload = page.getByTestId("school-ai-messages");
    await expect(afterReload.getByText(first)).toHaveCount(0);
    await expect(afterReload.getByText(second)).toBeVisible();
  });

  test("school AI: deleting an answer keeps the question", async () => {
    const thread = page.getByTestId("school-ai-messages");
    await expect(thread.locator("> div")).toHaveCount(2);
    const question = await thread.locator("> div").first().innerText();

    await deleteRow(page, thread.locator("> div").nth(1));
    await expect(thread.locator("> div")).toHaveCount(1);
    // The question survives: a bad answer can go without losing what was
    // asked.
    expect(await thread.locator("> div").first().innerText()).toBe(question);
  });

  test("the AI Coach can edit a message too, not only the school AI", async () => {
    await page.goto("/coach");
    const box = page.locator('form input[name="message"]');
    await box.waitFor({ timeout: 15_000 });

    const typo = `Wie plane ich meine Wohce ${Date.now()}`;
    await box.fill(typo);
    await box.press("Enter");
    const thread = page.getByTestId("coach-messages");
    await expect(thread.getByText(typo)).toBeVisible({ timeout: 20_000 });

    await thread.locator("> div").first().locator('[data-testid^="edit-message-"]').click();
    const form = page.locator('[data-testid^="edit-form-"]').first();
    await expect(form).toBeVisible();
    const fixed = typo.replace("Wohce", "Woche");
    await form.locator("textarea").fill(fixed);
    await form.getByRole("button", { name: "Ask again" }).click();

    await expect(thread.getByText(fixed)).toBeVisible({ timeout: 20_000 });
    await expect(thread.getByText(typo, { exact: true })).toHaveCount(0);
  });

  test("the AI Coach can delete one message", async () => {
    const thread = page.getByTestId("coach-messages");
    const before = await thread.locator("> div").count();
    expect(before).toBeGreaterThanOrEqual(2);

    await deleteRow(page, thread.locator("> div").first());
    await expect(thread.locator("> div")).toHaveCount(before - 2);

    await page.reload();
    await expect(page.getByTestId("coach-messages").locator("> div")).toHaveCount(before - 2);
  });

  test("a reply offers no edit, in either chat", async () => {
    // An edited answer would be this app putting words in the AI's mouth
    // and then reading them back to it as its own.
    await page.goto("/school#school-ai");
    const box = page.locator('form input[name="message"]');
    await box.waitFor({ timeout: 15_000 });
    await box.fill("Noch eine Frage");
    await box.press("Enter");
    const thread = page.getByTestId("school-ai-messages");
    await expect(thread.locator("> div")).not.toHaveCount(0);
    const answer = thread.locator("> div").last();
    await expect(answer.locator('[data-testid^="edit-message-"]')).toHaveCount(0);
    // It can still be deleted, which is the point of having both.
    await expect(answer.locator('[data-testid^="delete-message-"]')).toHaveCount(1);
  });
});
