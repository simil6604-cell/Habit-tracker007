import { test, expect, type Browser, type Page } from "@playwright/test";
import { E2E_INVITE_CODE } from "./invite-code";

/**
 * What the browser's own voice is told to do.
 *
 * Reported as "the voice talks English with a horrible accent", and that is
 * exactly what it was: every reply was read in `navigator.language`, the
 * language of the PHONE. On a German-language device that is a German voice
 * reading English out loud.
 *
 * These run in a context whose language really is German, with the voice
 * list a German Chrome actually reports, and check what the page asks the
 * synthesiser for.
 */

type Spoken = { text: string; lang: string; voice: string | null };

/** The voices a German-language Chrome offers; the default one is German. */
const GERMAN_PHONE_VOICES = [
  { name: "Deutsch Deutschland", lang: "de-DE", localService: true, default: true },
  { name: "Google Deutsch", lang: "de-DE", localService: false, default: false },
  { name: "Google US English", lang: "en-US", localService: false, default: false },
  { name: "Google UK English Female", lang: "en-GB", localService: false, default: false },
];

async function stubVoice(page: Page, voices: typeof GERMAN_PHONE_VOICES) {
  await page.addInitScript((voiceList) => {
    (window as unknown as { __spoken: Spoken[] }).__spoken = [];

    // The real SpeechSynthesisUtterance refuses a `voice` that is not one of
    // the browser's own objects, so the whole pair is replaced.
    class FakeUtterance {
      text: string;
      lang = "";
      voice: { name: string; lang: string } | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = FakeUtterance;

    const synth = {
      getVoices: () => voiceList,
      speak: (utterance: FakeUtterance) => {
        (window as unknown as { __spoken: Spoken[] }).__spoken.push({
          text: utterance.text,
          lang: utterance.lang,
          voice: utterance.voice?.name ?? null,
        });
        setTimeout(() => utterance.onend?.(), 10);
      },
      cancel: () => {},
      pause: () => {},
      resume: () => {},
      speaking: false,
      pending: false,
      paused: false,
    };
    // `speechSynthesis` is a getter on window, so it can only be replaced
    // this way.
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });

    class FakeRecognition {
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      continuous = false;
      interimResults = false;
      lang = "de-CH";
      start() {}
      stop() {
        this.onend?.();
      }
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
  }, voices);
}

async function signedInGermanPage(browser: Browser, voices: typeof GERMAN_PHONE_VOICES): Promise<Page> {
  // A real German-language browser, which is where this goes wrong.
  const context = await browser.newContext({ locale: "de-CH" });
  const page = await context.newPage();
  await stubVoice(page, voices);
  await page.goto("/register");
  await page.fill('input[name="name"]', "Sprach Test");
  await page.fill('input[name="email"]', `e2e_voice_${Date.now()}@example.com`);
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
  await page.waitForURL("/");
  return page;
}

const spokenOn = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: Spoken[] }).__spoken);

test("an English reply is read by an English voice, on a German phone", async ({ browser }) => {
  const page = await signedInGermanPage(browser, GERMAN_PHONE_VOICES);

  // The language really is German, so the old code had every reason to
  // reach for a German voice.
  expect(await page.evaluate(() => navigator.language)).toContain("de");

  await page.goto("/coach");
  await page.getByTestId("voice-mode").click();

  await expect
    .poll(async () => (await spokenOn(page)).length, { timeout: 10_000 })
    .toBeGreaterThan(0);

  const [first] = await spokenOn(page);
  // The greeting is English. It must be asked for as English and handed an
  // English voice — setting the language alone is a hint Chrome and Safari
  // both ignore in favour of the system default.
  expect(first.lang, `"${first.text}" was asked for in ${first.lang}`).toBe("en-GB");
  expect(first.voice).toBe("Google UK English Female");

  await page.context().close();
});

test("with no English voice on the device, it still asks for English rather than forcing a German one", async ({
  browser,
}) => {
  // The honest fallback: handing over a German voice guarantees the accent,
  // so none is set and the locale is left to the browser to do what it can.
  const page = await signedInGermanPage(browser, [
    { name: "Deutsch Deutschland", lang: "de-DE", localService: true, default: true },
  ]);

  await page.goto("/coach");
  await page.getByTestId("voice-mode").click();
  await expect
    .poll(async () => (await spokenOn(page)).length, { timeout: 10_000 })
    .toBeGreaterThan(0);

  const [first] = await spokenOn(page);
  expect(first.lang).toBe("en-GB");
  expect(first.voice, "no voice at all beats the wrong one").toBeNull();

  await page.context().close();
});
