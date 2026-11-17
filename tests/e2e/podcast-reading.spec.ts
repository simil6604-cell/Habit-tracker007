import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { E2E_INVITE_CODE } from "./invite-code";

/**
 * The other kind of episode: your own notes, read to you.
 *
 * Asked for in these words — read me my notes so I only have to listen
 * instead of reading them. Two things have to hold for that to be worth
 * anything, and neither is visible from the code.
 *
 * It has to be ONE voice. The teaching episode is two people talking and
 * the player really does use two voices for it; a reading handed to that
 * same player must not come out as a conversation between a narrator and
 * nobody.
 *
 * And the page has to say which kind each episode is, because once there
 * are six of them in the list, "Biology" and "Biology" are the same thing
 * on screen and you have to press play to find out which is which.
 *
 * The episodes go straight into the database: writing one needs the AI key,
 * which this suite deliberately runs without, and what is tested here is
 * the listening rather than the writing. For the same reason the form that
 * chooses between the two kinds is not driven from here — without a key the
 * page shows the "add ANTHROPIC_API_KEY" notice in its place. Which prompt
 * each kind builds, and from which of their notes, is pinned in
 * tests/unit/podcast-episode.test.ts instead.
 */

type Spoken = { text: string; voice: string | null };

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
          });
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

/** What a reading sounds like: notes turned into sentences, no speaker tags. */
const READING = [
  "Your Biology notes. Two topics, about four minutes. Osmosis first, then enzymes.",
  "Right — osmosis. Three things in your notes here, and the first one is the definition you wrote down.",
  "Water moves down its water potential gradient, which is the phrase your notes use, and it is the one the mark scheme wants.",
  "You wrote that you did not get which way the water actually goes, so here it is, properly.",
  "Water leaves the dilute side and crosses to the concentrated one, and it keeps going until the two sides match.",
  "That is the second of three. The third is what happens to a cell in pure water: it takes water in until it bursts.",
  "Now enzymes. Lock and key, and they denature above about forty degrees, which is the number in your notes.",
  "Denature is worth saying slowly: the shape of the active site changes, so the substrate no longer fits it.",
  "Last one, and then we are done. Your flashcard asks what osmosis is. Have a go.",
  "Water moving down its water potential gradient, through a partially permeable membrane.",
].join("\n");

async function register(page: Page): Promise<string> {
  const email = `e2e_read_${Date.now()}@example.com`;
  await page.goto("/register");
  await page.fill('input[name="name"]', "Reading Test");
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

function testPrisma() {
  return new PrismaClient({
    datasources: { db: { url: `file:${path.join(__dirname, "..", "..", "prisma", "test.db")}` } },
  });
}

test("a reading is one voice, and the list says which kind it is", async ({ page }) => {
  await stubSpeech(page);
  const email = await register(page);

  const prisma = testPrisma();
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.podcastEpisode.create({
      data: {
        userId: user.id,
        title: "Biology: your notes, read out",
        source: "Biology · Osmosis, Enzymes",
        script: READING,
        seconds: 240,
        style: "READING",
      },
    });
  } finally {
    await prisma.$disconnect();
  }

  await page.goto("/school/podcast");
  await expect(page.getByText("Biology: your notes, read out")).toBeVisible();
  // Which kind, before pressing play on it.
  await expect(page.getByText(/Read to me ·/)).toBeVisible();

  await page.getByTestId("podcast-play-all").click();
  await expect.poll(async () => (await spokenOn(page)).length, { timeout: 15_000 }).toBeGreaterThan(2);

  const spoken = await spokenOn(page);
  const voices = new Set(spoken.map((line) => line.voice));
  expect(voices.size, `spoken by ${[...voices].join(" / ")}`).toBe(1);
  // And it really is their notes being read, not a conversation about them.
  expect(spoken.some((line) => /water potential gradient/i.test(line.text))).toBe(true);
  for (const line of spoken) expect(line.text).not.toMatch(/^[AB]\s*:/);
});

test("an episode written before the two kinds existed still reads as the two-voice one", async ({ page }) => {
  const email = await register(page);

  const prisma = testPrisma();
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    // Written when there was only one kind, so the column was not there to
    // be filled in. It was a conversation, and that is what it has to say.
    await prisma.podcastEpisode.create({
      data: {
        userId: user.id,
        title: "Economics: elasticity",
        source: "Economics",
        script: "A: What happens to revenue?\nB: It drops, surely.\nA: It depends on elasticity.",
        seconds: 90,
      },
    });
  } finally {
    await prisma.$disconnect();
  }

  await page.goto("/school/podcast");
  await expect(page.getByText(/Two voices ·/)).toBeVisible();
});
