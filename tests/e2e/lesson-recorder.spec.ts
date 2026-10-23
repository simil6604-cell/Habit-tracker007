import { test, expect, type Page } from "@playwright/test";
import { E2E_INVITE_CODE } from "./invite-code";

/**
 * Recording a lesson from the school AI.
 *
 * The assertion that matters most here is the draft one. A recording exists
 * only in the tab until it is saved, and a phone that locks or a tab the
 * system discards would otherwise take a whole lesson with it — forty minutes
 * of someone's attention, gone with nothing to show for it.
 */

/** A microphone that reports exactly what we say it heard. */
async function stubMicrophone(page: Page) {
  await page.addInitScript(() => {
    class FakeRecognition {
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      continuous = false;
      interimResults = false;
      lang = "en-GB";
      constructor() {
        (window as unknown as { __rec: FakeRecognition }).__rec = this;
      }
      start() {}
      stop() {
        this.onend?.();
      }
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
    (window as unknown as { __hear: (t: string) => void }).__hear = (text: string) => {
      const rec = (window as unknown as { __rec: FakeRecognition }).__rec;
      rec.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] });
    };
  });
}

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

const LINES = [
  "Right, settle down, phones away.",
  "The mole is the amount of substance containing six point zero two times ten to the twenty three particles.",
  "For Friday, do questions one to eight on page forty two.",
];

async function recordALesson(page: Page) {
  await page.getByTestId("lesson-recorder-toggle").click();
  await page.getByTestId("lesson-start").click();
  for (const line of LINES) {
    await page.evaluate((t) => (window as unknown as { __hear: (s: string) => void }).__hear(t), line);
    await page.waitForTimeout(150);
  }
}

test("a recorded lesson is written down, saved, and can be read back", async ({ page }) => {
  await stubMicrophone(page);
  await register(page, "lesson1");
  await page.goto("/school");

  await recordALesson(page);

  const transcript = page.getByTestId("lesson-transcript");
  await expect(transcript).toHaveValue(/six point zero two/);
  // Chunks must not run together, or a lesson comes out as one long word.
  await expect(transcript).not.toHaveValue(/awayThe|particlesFor/);

  await page.getByTestId("lesson-title").fill("Moles intro");
  await page.getByTestId("lesson-stop").click();

  const row = page.getByTestId("lesson-row").first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Moles intro");
  // No AI key in this suite, so it must say so rather than looking finished.
  await expect(row).toContainText(/no notes were made/i);

  await page.getByText("Show what was said").first().click();
  await expect(row).toContainText("page forty two");

  // And it is really saved, not just on screen.
  await page.reload();
  await page.getByTestId("lesson-recorder-toggle").click();
  await expect(page.getByTestId("lesson-row").first()).toContainText("Moles intro");
});

test("a lesson is not lost when the tab goes before it is saved", async ({ page }) => {
  await stubMicrophone(page);
  await register(page, "lesson2");
  await page.goto("/school");

  await recordALesson(page);
  await expect(page.getByTestId("lesson-transcript")).toHaveValue(/six point zero two/);

  // The phone locked, the tab was discarded, the page was reloaded by
  // accident. Nothing was saved to the server.
  await page.reload();
  await page.getByTestId("lesson-recorder-toggle").click();

  const draft = page.getByTestId("lesson-draft");
  await expect(draft).toBeVisible();
  await page.getByTestId("lesson-draft-restore").click();

  await expect(page.getByTestId("lesson-transcript")).toHaveValue(/six point zero two/);
  await expect(page.getByTestId("lesson-transcript")).toHaveValue(/page forty two/);
});

test("the offer to restore goes away once the lesson is safely saved", async ({ page }) => {
  await stubMicrophone(page);
  await register(page, "lesson3");
  await page.goto("/school");

  await recordALesson(page);
  await page.getByTestId("lesson-stop").click();
  await expect(page.getByTestId("lesson-row").first()).toBeVisible();

  await page.reload();
  await page.getByTestId("lesson-recorder-toggle").click();
  // It is on the server now; offering it back would be offering a duplicate.
  await expect(page.getByTestId("lesson-draft")).toHaveCount(0);
  await expect(page.getByTestId("lesson-row").first()).toBeVisible();
});

test("a lesson filed under nothing still survives a backup and restore", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await stubMicrophone(page);
  await register(page, "lesson4");
  await page.goto("/school");

  // No subject picked, which is the normal case: you press record when the
  // lesson starts, not after filing it.
  await recordALesson(page);
  await page.getByTestId("lesson-title").fill("Unfiled lesson");
  await page.getByTestId("lesson-stop").click();
  await expect(page.getByTestId("lesson-row").first()).toContainText("Unfiled lesson");

  const archive = await (await page.request.get("/api/export")).body();

  // The disaster this is for: the app is gone and all you have is the file.
  const fresh = await browser.newContext();
  const freshPage = await fresh.newPage();
  await register(freshPage, "lesson5");

  await freshPage.goto("/settings");
  await freshPage.setInputFiles('input[type="file"][accept*="gzip"]', {
    name: "backup.tar.gz",
    mimeType: "application/gzip",
    buffer: archive,
  });
  await freshPage.getByTestId("restore-confirm").check();
  const restored = freshPage.waitForResponse((r) => r.url().includes("/api/restore"));
  await freshPage.getByRole("button", { name: "Restore this backup" }).click();
  expect((await restored).status()).toBe(200);

  await freshPage.goto("/school");
  await freshPage.getByTestId("lesson-recorder-toggle").click();
  // Without the restore knowing that a recording may have no topic, this row
  // is dropped on the way in and forty minutes of someone's lesson is gone
  // with nothing to say it ever existed.
  const row = freshPage.getByTestId("lesson-row").first();
  await expect(row).toContainText("Unfiled lesson");
  await freshPage.getByText("Show what was said").first().click();
  await expect(row).toContainText("page forty two");

  await fresh.close();
});
