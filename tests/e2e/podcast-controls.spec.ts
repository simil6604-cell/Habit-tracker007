import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { E2E_INVITE_CODE } from "./invite-code";

/**
 * An episode that behaves like a voice recording.
 *
 * Asked for in those words: like a voice recording of my notes. Speaking it
 * a piece at a time is this player's own plumbing, and a player that counts
 * "7 of 41", starts only at the beginning and forgets everything the moment
 * you leave makes you live with that plumbing.
 *
 * So the three things a recording does are what is tested here: a bar you
 * drag to somewhere in the middle and it carries on from there, thirty
 * seconds back for the sentence a bus drowned out, and coming back to it
 * later where you left it rather than at the start.
 *
 * The browser's voice is stubbed, so an episode plays in the time the test
 * takes to run and every line it says is recorded.
 */

type Spoken = { text: string };

async function stubSpeech(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __spoken: Spoken[] }).__spoken = [];
    class FakeUtterance {
      text: string;
      lang = "";
      voice: { name: string } | null = null;
      pitch = 1;
      rate = 1;
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
          (window as unknown as { __spoken: Spoken[] }).__spoken.push({ text: u.text });
          // Slow enough that a pause can land in the middle of an episode,
          // fast enough that the whole thing plays inside a test.
          setTimeout(() => u.onend?.(), 120);
        },
        cancel: () => {},
        pause: () => {},
        resume: () => {},
      },
    });
  });
}

const spokenOn = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: Spoken[] }).__spoken);

/**
 * Twenty-four sentences, each long enough that they group into several
 * pieces and each carrying its own number, so it is always clear which part
 * of the episode is being said.
 */
const SCRIPT = Array.from({ length: 24 }, (_, i) =>
  `Point ${i + 1}. This is the part of your notes about the ${i + 1}th thing you wrote down, said in a full sentence so you can follow it while you walk.`
).join("\n");

async function register(page: Page): Promise<string> {
  const email = `e2e_ctrl_${Date.now()}@example.com`;
  await page.goto("/register");
  await page.fill('input[name="name"]', "Controls Test");
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

async function anEpisode(email: string) {
  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${path.join(__dirname, "..", "..", "prisma", "test.db")}` } },
  });
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.podcastEpisode.create({
      data: {
        userId: user.id,
        title: "Biology: your notes, read out",
        source: "Biology",
        script: SCRIPT,
        seconds: 300,
        style: "READING",
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** The clock under the bar, as seconds. */
async function clockSeconds(page: Page): Promise<number> {
  const text = await page.getByTestId("podcast-progress").innerText();
  const [elapsed] = text.split("/").map((part) => part.trim());
  const [minutes, seconds] = elapsed.split(":").map(Number);
  return minutes * 60 + seconds;
}

test("the bar says how far in and how long, as a clock", async ({ page }) => {
  await stubSpeech(page);
  await anEpisode(await register(page));
  await page.goto("/school/podcast");

  // Not "0/41", which is this player's own plumbing showing through.
  await expect(page.getByTestId("podcast-progress")).toHaveText(/^\d+:\d\d \/ \d+:\d\d$/);
  const total = (await page.getByTestId("podcast-progress").innerText()).split("/")[1].trim();
  expect(total).not.toBe("0:00");
});

test("dragging the bar plays from there, not from the beginning", async ({ page }) => {
  await stubSpeech(page);
  await anEpisode(await register(page));
  await page.goto("/school/podcast");

  const seek = page.getByTestId("podcast-seek");
  const end = await seek.getAttribute("max");
  await seek.fill(end!);
  // Moving the bar while nothing is playing moves the mark and starts no
  // sound: a page that talks at you because you touched a slider is worse
  // than one that does nothing.
  expect(await spokenOn(page)).toEqual([]);
  expect(await clockSeconds(page)).toBeGreaterThan(60);

  await page.getByTestId("podcast-play").click();
  await expect.poll(async () => (await spokenOn(page)).length, { timeout: 10_000 }).toBeGreaterThan(0);

  const spoken = await spokenOn(page);
  // The end of the episode, not the start of it.
  expect(spoken[0].text).toContain("Point 2");
  expect(spoken[0].text).not.toContain("Point 1.");
  expect(spoken.some((line) => line.text.includes("Point 24"))).toBe(true);
});

test("thirty seconds back, for the sentence the bus drowned out", async ({ page }) => {
  await stubSpeech(page);
  await anEpisode(await register(page));
  await page.goto("/school/podcast");

  const seek = page.getByTestId("podcast-seek");
  await seek.fill((await seek.getAttribute("max"))!);
  const atEnd = await clockSeconds(page);

  await page.getByTestId("podcast-back").click();
  const afterBack = await clockSeconds(page);
  expect(afterBack).toBeLessThan(atEnd);

  await page.getByTestId("podcast-forward").click();
  expect(await clockSeconds(page)).toBeGreaterThan(afterBack);
});

test("comes back to where you stopped, not to the beginning", async ({ page }) => {
  await stubSpeech(page);
  await anEpisode(await register(page));
  await page.goto("/school/podcast");

  await page.getByTestId("podcast-play").click();
  // Let it get properly into the episode before walking away from it.
  await expect.poll(async () => (await spokenOn(page)).length, { timeout: 10_000 }).toBeGreaterThan(2);
  await page.getByTestId("podcast-play").click(); // pause
  const stoppedAt = await clockSeconds(page);
  expect(stoppedAt).toBeGreaterThan(0);

  // The phone goes in a pocket, the tab is closed, the page comes back.
  await page.reload();
  await expect.poll(async () => clockSeconds(page), { timeout: 10_000 }).toBe(stoppedAt);

  await page.getByTestId("podcast-play").click();
  await expect.poll(async () => (await spokenOn(page)).length, { timeout: 10_000 }).toBeGreaterThan(0);
  // Carries on rather than reading the opening again.
  expect((await spokenOn(page))[0].text).not.toContain("Point 1.");
});

test("hearing an episode out forgets where you were, so it starts again next time", async ({ page }) => {
  await stubSpeech(page);
  await anEpisode(await register(page));
  await page.goto("/school/podcast");

  const seek = page.getByTestId("podcast-seek");
  await seek.fill((await seek.getAttribute("max"))!);
  await page.getByTestId("podcast-play").click();

  // Played to the end: the mark goes back to the start and stays there.
  await expect.poll(async () => clockSeconds(page), { timeout: 15_000 }).toBe(0);
  await page.reload();
  expect(await clockSeconds(page)).toBe(0);
});
