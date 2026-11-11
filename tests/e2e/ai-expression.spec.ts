import { test, expect, type Page } from "@playwright/test";
import { E2E_INVITE_CODE } from "./invite-code";

/**
 * The dial for how much life the AI puts into it.
 *
 * Asked for as a setting, so the thing to prove is that the setting
 * actually reaches the voice — not that a picker exists. The browser's
 * voice is stubbed, the same answer is read out at two different settings,
 * and the delivery has to differ.
 */

type Spoken = { text: string; rate: number; pitch: number; voice: string | null };

async function stubSpeech(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __spoken: Spoken[] }).__spoken = [];
    class FakeUtterance {
      text: string;
      lang = "";
      voice: { name: string } | null = null;
      rate = 1;
      pitch = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = FakeUtterance;
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => [{ name: "Google UK English Female", lang: "en-GB", localService: false, default: true }],
        speak: (u: FakeUtterance) => {
          (window as unknown as { __spoken: Spoken[] }).__spoken.push({
            text: u.text,
            rate: u.rate,
            pitch: u.pitch,
            voice: u.voice?.name ?? null,
          });
          setTimeout(() => u.onend?.(), 5);
        },
        cancel: () => {},
        pause: () => {},
        resume: () => {},
      },
    });
  });
}

const spokenOn = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: Spoken[] }).__spoken);

/** Says something in the school AI with "Speak answers" on, and reports how it was read. */
async function askAndListen(page: Page, question: string): Promise<Spoken[]> {
  await page.goto("/school#school-ai");
  await page.getByRole("button", { name: /Speak answers/ }).click();
  const form = page.locator('form:has(input[name="message"])');
  await form.locator('input[name="message"]').fill(question);
  await form.locator('button[type="submit"]').click();
  await expect.poll(async () => (await spokenOn(page)).length, { timeout: 30_000 }).toBeGreaterThan(0);
  return spokenOn(page);
}

test("the expression setting reaches the voice", async ({ page }) => {
  await stubSpeech(page);

  await page.goto("/register");
  await page.fill('input[name="name"]', "Expression Test");
  await page.fill('input[name="email"]', `e2e_expr_${Date.now()}@example.com`);
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

  // Calm first.
  await page.goto("/settings");
  await expect(page.getByTestId("expression-picker")).toBeVisible();
  await page.getByTestId("expression-CALM").click();
  await expect(page.getByTestId("expression-CALM")).toHaveAttribute("aria-pressed", "true");

  const calm = await askAndListen(page, "what is osmosis");
  const calmRate = calm[0].rate;

  // The choice survives a reload, which is what "a setting" means.
  await page.goto("/settings");
  await expect(page.getByTestId("expression-CALM")).toHaveAttribute("aria-pressed", "true");

  // Now full throttle.
  await page.getByTestId("expression-HYPE").click();
  await expect(page.getByTestId("expression-HYPE")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByTestId("expression-HYPE")).toHaveAttribute("aria-pressed", "true");

  const loud = await askAndListen(page, "what is diffusion");
  const loudRate = loud[loud.length - 1].rate;

  // The same answer, read with more life in it. This is the whole feature:
  // without the setting reaching the voice, these two are identical.
  expect(loudRate, `calm ${calmRate} vs full throttle ${loudRate}`).toBeGreaterThan(calmRate);
  expect(loud[loud.length - 1].pitch).toBeGreaterThan(calm[0].pitch);
});
