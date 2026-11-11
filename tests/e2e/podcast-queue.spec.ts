import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { E2E_INVITE_CODE } from "./invite-code";

/**
 * Listening to episodes the way they are actually listened to.
 *
 * An episode is written as two people talking, because one voice reading
 * facts for ten minutes is the thing nobody finishes. Two things have to be
 * true for that to be worth anything: the two speakers must actually sound
 * different, and the next episode must start by itself — at the gym nobody
 * picks the phone back up between them.
 *
 * The episodes are put straight into the database: writing one needs the AI
 * key, which this suite deliberately runs without, and what is being tested
 * here is the playing rather than the writing.
 */

type Spoken = { text: string; voice: string | null; pitch: number; rate: number };

const VOICES = [
  { name: "Google UK English Female", lang: "en-GB", localService: false, default: true },
  { name: "Google UK English Male", lang: "en-GB", localService: false, default: false },
];

async function stubSpeech(page: Page) {
  await page.addInitScript((voices) => {
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
        getVoices: () => voices,
        speak: (u: FakeUtterance) => {
          (window as unknown as { __spoken: Spoken[] }).__spoken.push({
            text: u.text,
            voice: u.voice?.name ?? null,
            pitch: u.pitch,
            rate: u.rate,
          });
          // Straight on to the next line, so a whole episode plays in a
          // test in the time it takes to run it.
          setTimeout(() => u.onend?.(), 5);
        },
        cancel: () => {},
        pause: () => {},
        resume: () => {},
      },
    });
  }, VOICES);
}

const spokenOn = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: Spoken[] }).__spoken);

const EPISODE_ONE = [
  "A: Right — what happens to total revenue if they cut the price?",
  "B: It drops. Less money per unit, obviously.",
  "A: That is the trap everyone falls into. It depends on elasticity.",
  "B: So if demand is elastic?",
  "A: Revenue goes up. The extra sales more than cover the lower price.",
].join("\n");

const EPISODE_TWO = [
  "A: Second one. Osmosis — which way does the water actually go?",
  "B: Towards the salt, I always want to say.",
  "A: Right instinct, wrong words. Down the water potential gradient.",
].join("\n");

test("two voices, and the next episode starts on its own", async ({ page }) => {
  await stubSpeech(page);

  const email = `e2e_pod_${Date.now()}@example.com`;
  await page.goto("/register");
  await page.fill('input[name="name"]', "Podcast Test");
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

  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${path.join(__dirname, "..", "..", "prisma", "test.db")}` } },
  });
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    // Oldest first in the list is newest first on the page, so episode one
    // is created last.
    await prisma.podcastEpisode.create({
      data: {
        userId: user.id,
        title: "Biology: osmosis",
        source: "Biology",
        script: EPISODE_TWO,
        seconds: 60,
      },
    });
    await prisma.podcastEpisode.create({
      data: {
        userId: user.id,
        title: "Economics: elasticity",
        source: "Economics",
        script: EPISODE_ONE,
        seconds: 90,
      },
    });
  } finally {
    await prisma.$disconnect();
  }

  await page.goto("/school/podcast");
  await expect(page.getByText("Economics: elasticity")).toBeVisible();

  await page.getByTestId("podcast-play-all").click();

  // The first episode plays, and the two speakers are not the same voice.
  await expect.poll(async () => (await spokenOn(page)).length, { timeout: 15_000 }).toBeGreaterThan(3);
  const first = await spokenOn(page);
  const voices = new Set(first.map((line) => line.voice));
  expect(voices.size, `spoken by ${[...voices].join(" / ")}`).toBe(2);

  // The speaker tags are never read out loud.
  for (const line of first) expect(line.text).not.toMatch(/^[AB]\s*:/);

  // And the queue moves on by itself: nothing is pressed between the end
  // of the first episode and the start of the second.
  await expect
    .poll(async () => (await spokenOn(page)).some((line) => /osmosis/i.test(line.text)), { timeout: 30_000 })
    .toBe(true);

  // Both episodes, in order, with no gap that needed a tap.
  const all = await spokenOn(page);
  const elasticity = all.findIndex((line) => /elasticity/i.test(line.text));
  const osmosis = all.findIndex((line) => /osmosis/i.test(line.text));
  expect(elasticity).toBeGreaterThanOrEqual(0);
  expect(osmosis).toBeGreaterThan(elasticity);
});
