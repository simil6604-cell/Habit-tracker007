import { test, expect, type Browser, type Page } from "@playwright/test";
import { E2E_INVITE_CODE } from "./invite-code";

/**
 * What the microphone is actually told to listen for.
 *
 * Reported as "it doesn't listen properly, not like you do". Speech
 * recognition in a browser is never asked to work out the language — it is
 * TOLD one, and everything it hears is forced through that language's
 * model. Told English and given a German sentence it does not fail visibly:
 * it returns confident English words that sound a bit like what was said.
 *
 * Two things are checked here, and the real microphone is replaced by a
 * stand-in so they can be: which language each page asks for, and what the
 * page does when what comes back is plainly the other one.
 */

type Fake = { lang: string; started: number };

async function stubRecognition(page: Page) {
  await page.addInitScript(() => {
    const started: string[] = [];
    (window as unknown as { __started: string[] }).__started = started;

    class FakeRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        started.push(this.lang);
        (window as unknown as { __current: FakeRecognition | null }).__current = this;
      }

      stop() {
        this.onend?.();
      }
    }

    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;

    // What the test "says" into the microphone.
    (window as unknown as { __hear: (text: string) => void }).__hear = (text: string) => {
      const current = (window as unknown as { __current: FakeRecognition | null }).__current;
      current?.onresult?.({
        resultIndex: 0,
        results: { length: 1, 0: { isFinal: true, 0: { transcript: text } } },
      });
    };

    // Nothing here should ever actually talk out loud.
    Object.defineProperty(window, "speechSynthesis", {
      value: { getVoices: () => [], speak: () => {}, cancel: () => {}, pause: () => {}, resume: () => {} },
      configurable: true,
    });
  });
}

const startedLangs = (page: Page) => page.evaluate(() => (window as unknown as { __started: string[] }).__started);
const say = (page: Page, text: string) =>
  page.evaluate((heard) => (window as unknown as { __hear: (t: string) => void }).__hear(heard), text);

async function signedInPage(browser: Browser): Promise<Page> {
  // A German-language browser on purpose: that is the device where being
  // told the wrong language is the normal case rather than the odd one.
  const context = await browser.newContext({ locale: "de-CH" });
  const page = await context.newPage();
  await stubRecognition(page);
  await page.goto("/register");
  await page.fill('input[name="name"]', "Mic Test");
  await page.fill('input[name="email"]', `e2e_mic_${Date.now()}@example.com`);
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
  await page.waitForTimeout(1500);
  return page;
}

test.describe.serial("the microphone", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await signedInPage(browser);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test("school AI: a Swiss phone dictates in Standard German, not Swiss German", async () => {
    await page.goto("/school#school-ai");
    await page.getByRole("button", { name: /^Dictate$/ }).click();

    // The device really is de-CH. Swiss German is a different spoken
    // language, and a student dictating Hochdeutsch about school through
    // that model is misheard every sentence while everything looks right.
    expect(await page.evaluate(() => navigator.language)).toBe("de-CH");
    expect((await startedLangs(page)).at(-1)).toBe("de-DE");

    await say(page, "was ist Osmose in Biologie");
    // It lands in the box you would have typed into, so a misheard word can
    // be fixed before it is sent.
    await expect(page.locator('form input[name="message"]')).toHaveValue(/Osmose/i);
  });

  test("school AI: an English sentence through a German microphone is caught and fixable", async () => {
    await say(page, "can you explain what osmosis is to me again");

    const offer = page.getByTestId("dictation-mismatch");
    await expect(offer).toBeVisible();
    await expect(offer).toContainText(/English/);

    await offer.getByRole("button", { name: /Listen in EN/ }).click();
    // The language is fixed when the recognizer starts, so the fix is only
    // real if it started again with the new one.
    await expect.poll(async () => (await startedLangs(page)).at(-1)).toBe("en-GB");
    await expect(offer).toBeHidden();
  });

  test("the AI Coach gets the same choice, instead of the raw phone language", async () => {
    // This is the regression: the coach never passed a language at all, so
    // the hook fell back to navigator.language — de-CH, the dialect.
    //
    // The choice made on the school AI a moment ago is remembered for the
    // whole app, which is right and would hide what is being tested. So it
    // is cleared first, and what the coach does on a fresh device is what
    // is checked.
    await page.goto("/coach");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const before = (await startedLangs(page)).length;
    await page.getByRole("button", { name: /^Dictate$/ }).click();

    const started = await startedLangs(page);
    expect(started.length).toBeGreaterThan(before);
    expect(started.at(-1)).toBe("de-DE");
    expect(started.at(-1)).not.toBe("de-CH");

    await say(page, "wie soll ich meine Woche mit Training und Prüfungen planen");
    await expect(page.locator('form input[name="message"]')).toHaveValue(/Woche/i);
  });

  test("the coach catches the wrong language too", async () => {
    // A fresh session rather than carrying on: two sentences in two
    // languages in one transcript is genuinely undecidable, and the offer
    // is deliberately quiet when it cannot tell.
    await page.reload();
    await page.getByRole("button", { name: /^Dictate$/ }).click();
    await say(page, "how should I plan my week with training and exams");
    await expect(page.getByTestId("dictation-mismatch")).toBeVisible();
    await expect(page.getByTestId("dictation-mismatch")).toContainText(/English/);
  });
});
