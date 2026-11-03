import { test, expect, type Page } from "@playwright/test";
import { E2E_INVITE_CODE } from "./invite-code";

/**
 * The list of past conversations and recordings, with names you write.
 *
 * Asked for with a picture of Claude's own sidebar. The parts that matter
 * are the ones a single chat never had to get right: a new conversation must
 * start empty, an old one must come back with its own messages and nobody
 * else's, and a name typed by hand must survive everything the app does
 * afterwards.
 */

async function register(page: Page, label: string) {
  await page.goto("/register");
  await page.fill('input[name="name"]', label);
  await page.fill('input[name="email"]', `e2e_${label}_${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "password123");
  await page.fill('input[name="invite"]', E2E_INVITE_CODE);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL("**/onboarding");
  await page.click('button:has-text("Continue")');
  await expect(page.getByText("Where does most of your effort go?")).toBeVisible();
  await page.click('button:has-text("School")');
  await page.click('button:has-text("Continue")');
  await page.fill('input[placeholder*="Riverside"]', "Test School");
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Finish setup")');
  await page.waitForURL("/");
}

async function ask(page: Page, question: string) {
  await page.locator('input[placeholder*="Ask anything"]').fill(question);
  await page.locator('form:has(input[placeholder*="Ask anything"]) button[type="submit"]').click();
  // No AI key in this suite, so the reply is the honest fallback — but the
  // question and the conversation around it are real.
  await expect(page.getByTestId("school-ai-messages")).toContainText(question);
}

const rows = (page: Page) => page.getByTestId("history-row");

async function openHistory(page: Page) {
  await page.getByTestId("chat-history-toggle").click();
  await expect(page.getByTestId("new-chat")).toBeVisible();
}

test("each conversation is kept, named after what was asked", async ({ page }) => {
  await register(page, "hist1");
  await page.goto("/school");

  await ask(page, "What is a mole ratio?");
  await openHistory(page);
  await expect(rows(page).first()).toContainText("What is a mole ratio?");
});

test("a new chat starts empty and leaves the old one alone", async ({ page }) => {
  await register(page, "hist2");
  await page.goto("/school");

  await ask(page, "What is a mole ratio?");
  await openHistory(page);
  await page.getByTestId("new-chat").click();

  // The whole point of a second conversation. Written as a count because an
  // empty chat renders no message list at all, and "not.toContainText" on an
  // element that does not exist fails rather than passing.
  await expect(page.getByTestId("school-ai-messages").filter({ hasText: "mole ratio" })).toHaveCount(0);

  await ask(page, "What is investment?");
  // Two conversations now, each with its own question.
  await expect(rows(page).filter({ hasText: "mole ratio" })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: "investment" })).toHaveCount(1);

  // Going back brings its own messages, and only its own.
  await rows(page).filter({ hasText: "mole ratio" }).first().click();
  await expect(page.getByTestId("school-ai-messages")).toContainText("What is a mole ratio?");
  await expect(page.getByTestId("school-ai-messages")).not.toContainText("What is investment?");
  // That one is safe as written: this conversation has messages, so the list
  // is on screen to be checked.
});

test("a name typed by hand wins, and stays", async ({ page }) => {
  await register(page, "hist3");
  await page.goto("/school");

  await ask(page, "What is a mole ratio?");
  await openHistory(page);

  await rows(page).first().getByTestId("history-rename").click();
  await page.getByTestId("history-rename-input").fill("Chemistry revision");
  await page.getByTestId("history-rename-save").click();
  await expect(rows(page).first()).toContainText("Chemistry revision");
  // The derived name is never written down, so it cannot come back and
  // overwrite this one.
  await expect(rows(page).first()).not.toContainText("What is a mole ratio?");

  await page.reload();
  await openHistory(page);
  await expect(rows(page).first()).toContainText("Chemistry revision");
});

test("a conversation can be deleted without taking the others", async ({ page }) => {
  await register(page, "hist4");
  await page.goto("/school");

  await ask(page, "What is a mole ratio?");
  await openHistory(page);
  await page.getByTestId("new-chat").click();
  await ask(page, "What is investment?");

  await rows(page).filter({ hasText: "mole ratio" }).first().getByTestId("history-delete").click();
  await expect(rows(page).filter({ hasText: "mole ratio" })).toHaveCount(0);
  await expect(rows(page).filter({ hasText: "investment" })).toHaveCount(1);
});
