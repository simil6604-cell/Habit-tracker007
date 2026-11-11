import { test, expect, type Browser, type Page } from "@playwright/test";
import { E2E_INVITE_CODE } from "./invite-code";

/**
 * How much the microphone actually gets, and what keeps it listening.
 *
 * Separate from lesson-recorder.spec.ts, which covers saving a lesson and
 * not losing it. This one is about the complaint that it does not hear
 * everything.
 *
 * Three things cost a lesson in the real world and none of them is visible
 * on screen: the phone locks and suspends the page, the microphone is
 * picking up nothing because the phone is face down or in a bag, and the
 * half-sentence that was still being recognised when the browser ended its
 * session is dropped. All three are checked here.
 */

async function stubRecording(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__wakeRequests = 0;
    w.__wakeReleases = 0;
    // 128 is digital silence; the test moves this to simulate a room.
    w.__level = 128;

    class FakeRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        w.__current = this;
      }
      stop() {
        this.onend?.();
      }
    }
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;

    w.__hear = (text: string, final: boolean) => {
      const current = w.__current as FakeRecognition | undefined;
      current?.onresult?.({
        resultIndex: 0,
        results: { length: 1, 0: { isFinal: final, 0: { transcript: text } } },
      });
    };
    // What the browser does on its own every time speech pauses.
    w.__endSession = () => (w.__current as FakeRecognition | undefined)?.onend?.();

    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async () => {
          (w.__wakeRequests as number)++;
          return {
            release: async () => {
              (w.__wakeReleases as number)++;
            },
            addEventListener: () => {},
          };
        },
      },
    });

    // A microphone and an analyser, so the level meter has something to read.
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) },
    });
    class FakeAudioContext {
      createMediaStreamSource() {
        return { connect: () => {}, disconnect: () => {} };
      }
      createAnalyser() {
        return {
          fftSize: 1024,
          getByteTimeDomainData: (array: Uint8Array) => {
            for (let i = 0; i < array.length; i++) {
              // A square wave at the requested amplitude around the midpoint.
              array[i] = i % 2 === 0 ? (w.__level as number) : 256 - (w.__level as number);
            }
          },
        };
      }
      close() {
        return Promise.resolve();
      }
    }
    w.AudioContext = FakeAudioContext;

    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { getVoices: () => [], speak: () => {}, cancel: () => {}, pause: () => {}, resume: () => {} },
    });
  });
}

const heard = (page: Page, text: string, final = true) =>
  page.evaluate(
    ([t, f]) => (window as unknown as { __hear: (x: string, y: boolean) => void }).__hear(t as string, f as boolean),
    [text, final] as const
  );

async function signedInPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await stubRecording(page);
  await page.goto("/register");
  await page.fill('input[name="name"]', "Lesson Test");
  await page.fill('input[name="email"]', `e2e_lesson_${Date.now()}@example.com`);
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

test.describe.serial("the lesson microphone", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await signedInPage(browser);
    await page.goto("/school#school-ai");
    await page.getByTestId("lesson-recorder-toggle").click();
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test("keeps the screen awake, because a phone that locks stops listening", async () => {
    await page.getByTestId("lesson-start").click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __wakeRequests: number }).__wakeRequests))
      .toBeGreaterThan(0);
  });

  test("keeps the half-sentence the browser was still working on", async () => {
    // Interim words, and then the browser ends its own session on top of
    // them — which it does on every pause. They used to be dropped.
    await heard(page, "the mole is", false);
    await page.evaluate(() => (window as unknown as { __endSession: () => void }).__endSession());

    // The next thing heard is what proves it: unflushed interim text is
    // still on screen right after the session ends, and is overwritten the
    // moment anything else arrives. It has to survive that.
    await heard(page, "a unit of amount of substance");
    await expect(page.getByTestId("lesson-transcript")).toHaveValue(
      /the mole is a unit of amount of substance/
    );
  });

  test("flags a moment without interrupting the lesson", async () => {
    await heard(page, "Avogadro's number is six point oh two times ten to the twenty three");
    await page.getByTestId("lesson-mark").click();

    await expect(page.getByTestId("lesson-transcript")).toHaveValue(/\[MARK\]/);
    await expect(page.getByTestId("lesson-meter")).toContainText("1 marked");
  });

  test("shows what is reaching the microphone", async () => {
    const bar = page.getByTestId("lesson-level-bar");
    await expect(bar).toHaveAttribute("data-status", "silent");

    // A room with someone talking in it.
    await page.evaluate(() => ((window as unknown as { __level: number }).__level = 210));
    await expect.poll(async () => bar.getAttribute("data-status"), { timeout: 5_000 }).toBe("good");

    // Back to a phone in a bag.
    await page.evaluate(() => ((window as unknown as { __level: number }).__level = 128));
    await expect.poll(async () => bar.getAttribute("data-status"), { timeout: 5_000 }).toBe("silent");
  });

  test("says so when nothing has reached it for a long time", async () => {
    // The warning is deliberately slow — a lesson has real pauses — so the
    // clock is moved rather than waited out.
    await page.clock.install();
    await page.clock.runFor(30_000);
    await expect(page.getByTestId("lesson-silent")).toBeVisible();
    await expect(page.getByTestId("lesson-silent")).toContainText(/out of your pocket/i);
  });

  test("lets the lock go when the lesson stops", async () => {
    await page.getByTestId("lesson-stop").click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __wakeReleases: number }).__wakeReleases))
      .toBeGreaterThan(0);
  });
});
