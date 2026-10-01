import { test, expect, type Page, type Browser } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTarGz } from "@/lib/export/tar";
import { makeNoisyPng } from "./big-image";
import { ean13Png } from "./ean13-png";
import { E2E_INVITE_CODE } from "./invite-code";

// The Web Speech API has no official TS DOM typings, so `tsc --noEmit` rejects
// these reads even though every browser that supports voice exposes them.
declare global {
  interface Window {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  }
}

/**
 * End-to-end smoke test for the whole app: registers a fresh account, runs
 * onboarding, then exercises the core flow of every domain (School, Gym,
 * Football, AI Coach, Calendar, Tasks, Settings) against a real production
 * build and a disposable SQLite test database (see global-setup.ts).
 *
 * Run with: npm run test:e2e
 */

test.describe.serial("full app walkthrough", () => {
  /**
   * The Chemistry *subject* card.
   *
   * Matched by the link a subject card really is, rather than by anything on
   * the page whose text contains "Chemistry" — an exam called "Chemistry mock"
   * in the hero's Start here card is also a link saying Chemistry, and that
   * ambiguity broke these assertions the moment such an exam existed.
   */
  // Scoped to the Subjects list on purpose: the "Where you revise from" grid
  // links to each subject as well, so an unscoped link locator matches twice.
  const subjectLink = (p: Page, name: string) =>
    p.getByTestId("subject-cards").locator('a[href^="/school/subjects/"]', { hasText: name });
  const chemistryCard = (p: Page) => subjectLink(p, "Chemistry");

  let page: Page;
  const email = `e2e_${Date.now()}@example.com`;
  const password = "password123";

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("register + onboarding", async () => {
    await page.goto("/register");
    await page.fill('input[name="name"]', "E2E Test");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="invite"]', E2E_INVITE_CODE);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/onboarding");

    await page.click('button:has-text("Continue")'); // domains step

    // main-focus step: only shown when more than one domain is on
    await expect(page.getByText("Where does most of your effort go?")).toBeVisible();
    await page.click('button:has-text("School")');
    await page.click('button:has-text("Continue")'); // focus step

    await page.fill('input[placeholder*="Riverside"]', "Test School");
    await page.click('button:has-text("Continue")'); // school step
    await page.click('button:has-text("Continue")'); // gym step
    await page.click('button:has-text("Continue")'); // football step
    await page.click('button:has-text("Finish setup")');

    await page.waitForURL("/");
    await expect(page.getByText("What do you want to optimize today?")).toBeVisible();
  });

  test("register: the wrong invite code creates nothing at all", async ({ browser }: { browser: Browser }) => {
    // This app's AI runs on one person's API key, so every account that exists
    // spends their credit. /register used to be open to whoever had the link.
    const context = await browser.newContext();
    const stranger = await context.newPage();
    const strangerEmail = `e2e_stranger_${Date.now()}@example.com`;

    await stranger.goto("/register");
    // The field is on the page at all, which is the whole feature: without it
    // the server would be checking a code the form never asks for.
    await expect(stranger.locator('input[name="invite"]')).toBeVisible();

    await stranger.fill('input[name="name"]', "Stranger");
    await stranger.fill('input[name="email"]', strangerEmail);
    await stranger.fill('input[name="password"]', password);
    await stranger.fill('input[name="invite"]', "definitely-not-the-code");
    await stranger.getByRole("button", { name: /create account/i }).click();

    await expect(stranger.getByText(/invite code is not right/i)).toBeVisible();
    expect(new URL(stranger.url()).pathname).toBe("/register");

    // Refused is not the same as not created. The only way to know no row was
    // written is to try to use it — an account that exists would sign in here,
    // and this assertion is what a check placed after prisma.user.create would
    // fail on while still showing the same error message.
    await stranger.goto("/login");
    await stranger.fill('input[name="email"]', strangerEmail);
    await stranger.fill('input[name="password"]', password);
    await stranger.getByRole("button", { name: /sign in/i }).click();
    await expect(stranger.getByText(/invalid email or password/i)).toBeVisible();

    // And the right code still works, so the door is a door and not a wall.
    await stranger.goto("/register");
    await stranger.fill('input[name="name"]', "Invited");
    await stranger.fill('input[name="email"]', `e2e_invited_${Date.now()}@example.com`);
    await stranger.fill('input[name="password"]', password);
    await stranger.fill('input[name="invite"]', E2E_INVITE_CODE);
    await stranger.getByRole("button", { name: /create account/i }).click();
    await stranger.waitForURL("**/onboarding");

    await context.close();
  });

  test("home shows all three domain cards", async () => {
    await page.goto("/");
    await expect(page.locator('main a[href="/school"]')).toBeVisible();
    await expect(page.locator('main a[href="/gym"]')).toBeVisible();
    await expect(page.locator('main a[href="/football"]')).toBeVisible();
  });

  test("school: add a subject and a topic", async () => {
    await page.goto("/school");
    await page.fill('input[placeholder="Subject name"]', "Chemistry");
    await page.click('button:has-text("Add subject")');

    const subjectCard = chemistryCard(page);
    await expect(subjectCard).toBeVisible();
    await subjectCard.click();

    await page.fill('input[placeholder="e.g. Algebra"]', "Periodic Table");
    await page.click('button:has-text("Add topic")');
    await expect(page.getByRole("cell", { name: /Periodic Table/ })).toBeVisible();
  });

  test("school: the page opens with today, not with a banner", async () => {
    await page.goto("/school");
    const hero = page.getByTestId("school-hero");
    await expect(hero).toBeVisible();

    // What it replaced said "Timetable, subjects, homework and exams — all in
    // one place" every day of the year, which is another way of saying it told
    // you nothing about your day.
    await expect(page.getByText("Timetable, subjects, homework and exams")).toHaveCount(0);

    // The ring is a meter with the number labelled inside it, so the value is
    // readable without telling the fill from the track.
    await expect(hero.locator("svg circle")).not.toHaveCount(0);

    // Seven days, one mark each, and today is the last of them.
    await expect(page.getByTestId("school-week").locator("> div")).toHaveCount(7);

    // Every shortcut goes somewhere that exists. Scoped to the shortcut row:
    // the main button is also a link to the School AI, worded differently.
    const shortcuts = page.getByTestId("school-shortcuts");
    for (const [label, href] of [
      ["School AI", "/school#school-ai"],
      ["Habit tracker", "/school/habits"],
      ["Study planner", "/school/planner"],
      ["Flashcards", "/school/flashcards"],
      ["Timetable", "/school/timetable"],
    ] as const) {
      await expect(shortcuts.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
    }

    // The headline is about this account, and the subject count is real: the
    // test added Chemistry a moment ago.
    await expect(hero).toContainText(/subject/);
    await expect(hero.getByRole("heading")).not.toBeEmpty();
  });

  test("school: a revision link is saved and stays a link, not content", async () => {
    await page.goto("/school");
    await chemistryCard(page).click();

    await expect(page.getByText("Revision source")).toBeVisible();
    // The card has to be explicit that saving a link doesn't hand the AI the
    // site's content — that's the whole basis on which it's safe to save.
    await expect(page.getByText(/never fetches the page/)).toBeVisible();

    const form = page.locator('form:has(input[name="revisionUrl"])');
    const url = "https://www.savemyexams.com/igcse/chemistry/cie/";
    await form.locator('input[name="revisionUrl"]').fill(url);
    await form.locator('button[type="submit"]').click();

    const link = page.getByRole("link", { name: /Open revision notes/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", url);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);

    // The value lands in an href, so a scheme that can run code is refused.
    await form.locator('input[name="revisionUrl"]').fill("javascript:alert(1)");
    await form.locator('button[type="submit"]').click();
    await page.reload();
    for (const bad of await page.locator("main a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))) {
      expect(bad.startsWith("javascript:")).toBe(false);
    }
  });

  test("school: a topic can point at its own revision page, or inherit the subject's", async () => {
    await page.goto("/school");
    await chemistryCard(page).click();

    // Give the subject a link, then open the topic that has none of its own.
    const subjectUrl = "https://www.savemyexams.com/igcse/chemistry/cie/";
    const subjectForm = page.locator('form:has(input[name="revisionUrl"])').first();
    await subjectForm.locator('input[name="revisionUrl"]').fill(subjectUrl);
    await subjectForm.locator('button[type="submit"]').click();
    await expect(page.getByRole("link", { name: /Open revision notes/ })).toBeVisible();

    const openTopic = async () => {
      await page
        .locator("tr", { hasText: "Periodic Table" })
        .first()
        .locator('button[title="AI Learning Assistant"]')
        .click();
    };
    await openTopic();

    // Inherited, and labelled as the subject's so you know where you'll land.
    const inherited = page.getByRole("link", { name: /revision notes on/ });
    await expect(inherited).toHaveAttribute("href", subjectUrl);
    await expect(inherited).toContainText(/the subject's/);

    // A topic-specific link takes over, and says so.
    const topicUrl = "https://www.savemyexams.com/igcse/chemistry/cie/revision-notes/the-periodic-table/";
    const topicForm = page.locator('form:has(input[name="revisionUrl"])').last();
    await topicForm.locator('input[name="revisionUrl"]').fill(topicUrl);
    // Wait for this save before reloading. Reloading straight after the click
    // races the server action, and a page rebuilt from the state before it
    // lands still shows the inherited link.
    //
    // Matched on the body, not just "a POST to this page": the subject's own
    // save a few lines above is still in flight, and waiting for whichever POST
    // finishes first let the reload race the one that mattered. That is why
    // this test still flaked after the first attempt at fixing it.
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && (response.request().postData() ?? "").includes("the-periodic-table")
    );
    await topicForm.locator('button[type="submit"]').click();
    await saved;
    await page.reload();
    await openTopic();

    const own = page.getByRole("link", { name: /revision notes on/ });
    await expect(own).toHaveAttribute("href", topicUrl);
    await expect(own).toContainText(/this topic's/);
  });

  test("school: an assistant reply renders as structure, not raw markdown", async () => {
    await page.goto("/school");
    await chemistryCard(page).click();
    await page
      .locator("tr", { hasText: "Periodic Table" })
      .first()
      .locator('button[title="AI Learning Assistant"]')
      .click();

    // Ask something and wait for a reply, whatever the AI situation is.
    await page.fill('input[placeholder="Ask anything about this topic…"]', "Explain group 1 trends.");
    await page.click('button:has-text("Send")');
    await expect(page.locator('button:has-text("I didn\'t get this")').first()).toBeVisible({ timeout: 60000 });

    // A revision-style answer uses headings, bullets and bold. Whatever the
    // reply contains, none of those markers may survive as literal characters —
    // that is what makes an answer look broken rather than structured.
    const main = (await page.locator("main").textContent()) ?? "";
    expect(main).not.toContain("**");
    expect(main).not.toMatch(/#{2,}\s/);
  });

  test("school: questions asked in the tutor chat reach the revision list", async () => {
    // The chat lives inside a topic row on the subject page.
    await page.goto("/school");
    await chemistryCard(page).click();
    await page
      .locator("tr", { hasText: "Periodic Table" })
      .first()
      .locator('button[title="AI Learning Assistant"]')
      .click();

    const ask = page.locator('input[placeholder="Ask anything about this topic…"]');
    await expect(ask).toBeVisible();

    // Without an AI key the tutor answers with an honest "not connected"
    // message, which is enough to exercise the logging either way.
    const question = "Why are noble gases unreactive?";
    await ask.fill(question);
    await page.click('button:has-text("Send")');
    await expect(page.locator('button:has-text("I didn\'t get this")').first()).toBeVisible({ timeout: 60000 });

    // Marking a reply puts the question you asked on the revision list, and
    // says out loud that the quiz uses it.
    await page.locator('button:has-text("I didn\'t get this")').first().click();
    await expect(page.getByText("Still to revise (1)")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(question, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/weights its questions towards these/)).toBeVisible();
    await expect(page.getByText("On your revision list")).toBeVisible();

    // And taking it off again clears it.
    await page.locator('button[title="I get this now — take it off the list"]').first().click();
    await expect(page.getByText("Still to revise")).toBeHidden({ timeout: 30000 });
  });

  test("school: flashcards can be built from what you didn't understand", async () => {
    await page.goto("/school/flashcards");
    const button = page.locator('button:has-text("From what I didn\'t understand")');
    await expect(button).toBeVisible();

    // Nothing is marked for this fresh account, so it must say so rather than
    // quietly doing nothing or inventing cards.
    await button.click();
    await expect(page.getByText(/Nothing marked as not understood yet|needs a real AI/)).toBeVisible({ timeout: 60000 });
  });

  test("school: a timetable holds both lessons and the gaps between them", async () => {
    await page.goto("/school/timetable");

    const rowCells = (row: ReturnType<typeof page.locator>) =>
      row.locator('input:not([type="time"]):not([type="checkbox"])');

    // A lesson period: this one links to a real subject.
    const lesson = page.locator("tbody tr").first();
    await rowCells(lesson).first().fill("P1");
    await lesson.locator('input[type="time"]').first().fill("08:00");
    await lesson.locator('input[type="time"]').nth(1).fill("09:00");
    await lesson.locator("select").selectOption("LESSON");
    await rowCells(lesson).nth(1).fill("Chemistry"); // Monday

    // And a break: no subject at all, which is most of a real timetable —
    // registration, breaks, lunch, study periods, free lessons.
    await page.getByRole("button", { name: "Add period" }).click();
    const breakRow = page.locator("tbody tr").nth(1);
    await rowCells(breakRow).first().fill("Break");
    await breakRow.locator('input[type="time"]').first().fill("09:00");
    await breakRow.locator('input[type="time"]').nth(1).fill("09:20");
    await breakRow.locator("select").selectOption("BREAK");
    await rowCells(breakRow).nth(1).fill("Morning break"); // Monday

    await page.getByRole("button", { name: "Save timetable" }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    await page.reload();
    await expect(page.locator('input[value="Chemistry"]')).toBeVisible();
    await expect(page.locator('input[value="Morning break"]')).toBeVisible();
  });

  test("school: the habit tracker is a checklist per day, and each day scores itself", async () => {
    await page.goto("/school/habits");
    await expect(page.getByText("Add a habit above to start tracking.")).toBeVisible();

    // The field has to take words nobody suggested. It used to carry a
    // <datalist>, which on a phone drops the suggestion list straight over the
    // input the moment you focus it — so writing your own habit looked
    // impossible, and for a box whose whole point is "write whatever you want"
    // looking impossible is the same as being impossible.
    const ownWords = `Mein eigenes Ziel ${Date.now()}`;
    await page.fill('input[name="name"]', ownWords);
    await expect(page.locator('input[name="name"]')).toHaveValue(ownWords);
    await expect(page.locator('input[name="name"][list]')).toHaveCount(0);
    await page.getByRole("button", { name: "Add habit" }).click();
    await expect(page.getByTestId("habit-analysis").getByText(ownWords)).toBeVisible();

    // The suggestions are still there, as buttons under the field, and they
    // fill the box rather than replacing what it can hold.
    const suggestion = page.getByTestId("habit-suggestions").getByRole("button").first();
    const suggestionText = (await suggestion.textContent())!.trim();
    await suggestion.click();
    await expect(page.locator('input[name="name"]')).toHaveValue(suggestionText);

    // And a suggestion can be edited before it is added — it is a starting
    // point, not a fixed choice.
    await page.fill('input[name="name"]', `${suggestionText} (angepasst)`);
    await page.getByRole("button", { name: "Add habit" }).click();
    await expect(page.getByTestId("habit-analysis").getByText(`${suggestionText} (angepasst)`)).toBeVisible();

    // Cleared again, so the day percentages below are arithmetic over exactly
    // the four habits this test adds next and not over these two as well.
    for (const name of [ownWords, `${suggestionText} (angepasst)`]) {
      await page.getByTitle(`Delete "${name}"`).click();
      await expect(page.getByTestId("habit-analysis").getByText(name)).toHaveCount(0);
    }

    for (const [emoji, name] of [
      ["📘", "Reviewed today's lessons"],
      ["📖", "Read 20 minutes"],
      ["🎒", "Packed the bag"],
      ["✏️", "Did the homework"],
    ] as const) {
      await page.fill('input[name="emoji"]', emoji);
      await page.fill('input[name="name"]', name);
      await page.getByRole("button", { name: "Add habit" }).click();
      await expect(page.getByTestId("habit-analysis").getByText(name)).toBeVisible();
    }

    // Seven cards, one per day of the week, each holding the whole checklist.
    const cards = page.getByTestId("habit-day-cards").locator("> div");
    await expect(cards).toHaveCount(7);

    // Today's card is the one you actually tick, so it is marked and enabled.
    // Matched on the exact badge, not hasText: "Today" is a substring of
    // "Reviewed today's lessons", which sits in all seven cards.
    const todayBadge = page.getByText("Today", { exact: true });
    const today = page.locator('[data-testid^="habit-card-"]').filter({ has: todayBadge });
    await expect(today).toHaveCount(1);

    const todayKey = (await today.getAttribute("data-testid"))!.replace("habit-card-", "");
    const pct = page.getByTestId(`habit-pct-${todayKey}`);
    await expect(pct).toHaveText("0%");
    await expect(today.getByText("0 of 4")).toBeVisible();

    // Each tick is a real write, and the day's own score moves with it.
    await today.getByRole("button", { name: /Reviewed today's lessons/ }).click();
    await expect(page.getByTestId(`habit-pct-${todayKey}`)).toHaveText("25%");
    await today.getByRole("button", { name: /Read 20 minutes/ }).click();
    await expect(page.getByTestId(`habit-pct-${todayKey}`)).toHaveText("50%");

    // It scores that day, not the week: the other days are untouched.
    const otherScores = await page
      .locator('[data-testid^="habit-pct-"]')
      .evaluateAll((els) => els.map((e) => e.textContent));
    expect(otherScores.filter((t) => t === "50%")).toHaveLength(1);

    // Ticking again unticks — the checklist is not one-way.
    await today.getByRole("button", { name: /Read 20 minutes/ }).click();
    await expect(page.getByTestId(`habit-pct-${todayKey}`)).toHaveText("25%");

    // It really saved, rather than only looking ticked.
    await page.reload();
    await expect(page.getByTestId(`habit-pct-${todayKey}`)).toHaveText("25%");

    // A day that hasn't happened can't be ticked. Conditional on purpose: the
    // week runs Monday to Sunday, so on a Sunday there is no future day left in
    // it and an unconditional assertion here is red once a week — which is
    // exactly how this test first failed. Either branch asserts something, so
    // it is never quietly passing on nothing, and the server-side half of the
    // rule is covered by parseHabitDate's unit tests whatever day it is.
    const futureCards = page.locator('[data-testid^="habit-card-"]').filter({ hasText: "Not yet" });
    if ((await futureCards.count()) > 0) {
      await expect(futureCards.first().getByRole("button", { name: /Read 20 minutes/ })).toBeDisabled();
    } else {
      await expect(page.locator('[data-testid^="habit-card-"]')).toHaveCount(7);
      await expect(page.getByText("Not yet")).toHaveCount(0);
    }

    // The analysis underneath: the chart, and a rate per habit.
    await expect(page.getByText(/Daily completion — last 28 days/)).toBeVisible();
    await expect(page.getByTestId("habit-analysis").locator("li")).toHaveCount(4);

    // Last week's cards are all in the past, so none of them is "Today" and
    // none is disabled as "Not yet".
    await page.getByRole("link", { name: "Previous week" }).click();
    await expect(page.getByText("Last week")).toBeVisible();
    await expect(page.getByTestId("habit-day-cards").locator("> div")).toHaveCount(7);
    await expect(page.getByText("Today", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Not yet")).toHaveCount(0);

    // A week nobody meant to ask for doesn't break the page.
    await page.goto("/school/habits?week=banana");
    await expect(page.getByText("This week")).toBeVisible();
    await page.goto("/school/habits?week=-9");
    await expect(page.getByText("This week")).toBeVisible();

    // And a habit can be removed, from the analysis list where it is named.
    await page.goto("/school/habits");
    await page.getByTitle('Delete "Packed the bag"').click();
    await expect(page.getByTestId("habit-analysis").locator("li")).toHaveCount(3);
    await expect(page.getByTestId(`habit-pct-${todayKey}`)).toHaveText("33%");
  });

  test("school ai: turns \"too much to do\" into a plan with dates, and tracks how ready it feels", async () => {
    // An exam three weeks out, so there is a real run-up to plan.
    const examDate = new Date(Date.now() + 21 * 86400000);
    const examIso = examDate.toISOString().slice(0, 10);
    const examTitle = `Chemistry mock ${Date.now()}`;

    await page.goto("/school");
    const examForm = page.locator('form:has(input[placeholder="Exam title"])');
    await examForm.locator('input[name="title"]').fill(examTitle);
    await examForm.locator('input[name="date"]').fill(examIso);
    await examForm.locator('button[type="submit"]').click();
    await expect(page.getByText(examTitle).first()).toBeVisible();

    // The plan is built from the School AI, because that is where "I have so
    // much to do" gets typed.
    await page.goto("/school");
    await page.getByTestId("open-plan-builder").click();
    const select = page.getByTestId("plan-exam-select");
    const optionValue = await select.locator("option", { hasText: examTitle }).getAttribute("value");
    expect(optionValue, "the new exam is offered in the picker").toBeTruthy();
    await select.selectOption(optionValue!);
    await page.getByTestId("plan-brief").fill("Behind on organic chemistry, football Tue and Thu");
    await page.getByRole("button", { name: "Build it" }).click();

    await page.waitForURL(/\/school\/plan\//, { timeout: 60000 });
    await expect(page.getByRole("heading", { name: examTitle })).toBeVisible();
    await expect(page.getByText(/Behind on organic chemistry/)).toBeVisible();

    // Every planned day is a real date before the exam, and the paper itself
    // is not one of them.
    const days = page.getByTestId("exam-plan-days").locator("li");
    const dayCount = await days.count();
    expect(dayCount).toBeGreaterThan(5);
    const dayKeys = await page
      .locator('[data-testid^="plan-day-"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("plan-day-", "")));
    expect(dayKeys).not.toContain(examIso);
    expect([...dayKeys].sort()).toEqual(dayKeys);

    // Ticking a day is a real write.
    const planUrl = page.url();
    await page.locator('[data-testid^="plan-day-"]').first().click();
    await expect(page.getByText(/1 of \d+ days done/)).toBeVisible();

    // Before any reading the chart says so instead of drawing a flat line at
    // zero, which would be a claim nobody made.
    await expect(page.getByText(/No readings yet/)).toBeVisible();

    // Rate today, and the line starts.
    await page.getByTestId("readiness-check-in").getByRole("button", { name: /Could pass/ }).click();
    await expect(page.getByText(/Saved for today/)).toBeVisible();

    await page.goto(planUrl);
    await expect(page.getByText(/No readings yet/)).toHaveCount(0);
    await expect(page.getByText(/Last rated 3\/5/)).toBeVisible();
    await expect(page.getByText(/1 of \d+ days done/)).toBeVisible();

    // And it is reachable again from the school AI rather than only by URL.
    // Scoped to that section: now the tutor shares the School page, the hero's
    // "start here" card names the same exam and matches the same text.
    await page.goto("/school");
    await expect(
      page.locator("#school-ai").getByRole("link", { name: new RegExp(examTitle) })
    ).toBeVisible();
  });

  test("school: the planner takes what you write, not only what it suggests", async () => {
    await page.goto("/school/planner");

    // The whole complaint this answers: the page was generated suggestions and
    // an "accept" button, with nowhere to put the thing you had already
    // decided to do.
    const form = page.getByTestId("add-study-block");
    await expect(form).toBeVisible();

    const ownWords = `Mein eigener Block ${Date.now()}`;
    await form.locator('input[name="title"]').fill(ownWords);
    await form.locator('input[name="time"]').fill("18:30");
    await form.locator('input[name="minutes"]').fill("50");
    await form.getByRole("button", { name: /Add my block/ }).click();

    const block = page.getByTestId("own-blocks").locator("li", { hasText: ownWords });
    await expect(block).toBeVisible();
    await expect(block).toContainText("18:30");

    // It is a real write, not an optimistic row that vanishes on reload.
    await page.reload();
    const saved = page.getByTestId("own-blocks").locator("li", { hasText: ownWords });
    await expect(saved).toBeVisible();

    // The server refuses a bad length even when the browser's own check is
    // gone. The min/max on the field stops an honest mistake, but it is markup
    // — stripping it is one line in a console, so the only check that counts
    // is the one on the server. That is what this removes the attribute to
    // reach, and the refusal has to be a sentence rather than a silent no-op.
    await form.locator('input[name="title"]').fill("Too short to be a block");
    // Only `min` is removed, and the value stays a multiple of the field's
    // step. Removing more, or picking 2 minutes, leaves the input invalid on
    // `step` instead and the browser never submits the form at all — so the
    // assertion below would be waiting on a request that was never made,
    // which is how this test failed the first time.
    await form.locator('input[name="minutes"]').evaluate((el) => el.removeAttribute("min"));
    await form.locator('input[name="minutes"]').fill("5");
    await form.getByRole("button", { name: /Add my block/ }).click();
    await expect(form.getByRole("alert")).toContainText(/Between 10 and 360 minutes/);

    // And nothing was written for it.
    await page.reload();
    await expect(page.getByTestId("own-blocks").locator("li", { hasText: "Too short to be a block" })).toHaveCount(0);

    // Ticking it off is what turns it into logged study time, so the same
    // block has to be countable afterwards.
    await saved.getByRole("button", { name: new RegExp(`Mark "${ownWords}" as done`) }).click();
    await expect(
      page.getByTestId("own-blocks").locator("li", { hasText: ownWords }).getByRole("button", { name: /as not done/ })
    ).toBeVisible();

    // It reached the calendar too, rather than living only on this page.
    await page.goto("/calendar");
    await expect(page.getByText(ownWords).first()).toBeVisible();

    // And it can be taken back out again, from both places.
    await page.goto("/school/planner");
    await page
      .getByTestId("own-blocks")
      .locator("li", { hasText: ownWords })
      .getByRole("button", { name: new RegExp(`Delete "${ownWords}"`) })
      .click();
    await expect(page.getByTestId("own-blocks").locator("li", { hasText: ownWords })).toHaveCount(0);

    await page.goto("/calendar");
    await expect(page.getByText(ownWords)).toHaveCount(0);
  });

  test("school: insights report what is measured, and say so when nothing is", async () => {
    // With no cards at all the panel correctly says there is nothing to
    // measure and draws no meter — so a card is created first, otherwise the
    // assertions below would be checking the empty state while claiming to
    // check the meter.
    await page.goto("/school");
    const insights = page.locator("#school-insights");
    await expect(insights).toBeVisible();
    await expect(insights).toContainText(/no flashcards yet|Never opened/i);

    await page.goto("/school/flashcards");
    const cardFront = `Insights card ${Date.now()}`;
    await page.fill('input[name="front"]', cardFront);
    await page.fill('input[name="back"]', "the answer");
    await page.getByRole("button", { name: "Add card" }).click();
    // A new card shows up twice: once in the review deck (it is due now) and
    // once in the list of all cards. The list is the one that proves it was
    // stored.
    await expect(page.getByRole("listitem").filter({ hasText: cardFront })).toBeVisible();

    await page.goto("/school");
    await expect(insights).toBeVisible();

    // Four tiles, each with a headline figure.
    await expect(insights.getByTestId("insight-stats").locator("> div")).toHaveCount(4);

    // This account has answered no flashcard, so recall must say it is not
    // measured rather than print 0% — the one number on this panel that would
    // be both false and demoralising.
    await expect(insights).toContainText(/Not measured/);
    await expect(insights).not.toContainText(/0% recall/);

    // Every bucket of the memory meter is labelled with its own count, which
    // is what makes the pale end of the ramp readable at all.
    await expect(insights.getByTestId("memory-legend").locator("> div")).toHaveCount(4);
    for (const label of ["Never opened", "Just started", "Getting there", "Strong"]) {
      await expect(insights.getByTestId("memory-legend")).toContainText(label);
    }

    // It says where you stand and what to do, and the actions go somewhere
    // that exists rather than being decoration.
    await expect(insights.getByTestId("where-you-stand").locator("li").first()).toBeVisible();
    const actions = insights.getByTestId("do-this-next").locator("a");
    const actionCount = await actions.count();
    expect(actionCount).toBeGreaterThan(0);
    expect(actionCount, "never more than two next steps").toBeLessThanOrEqual(2);
    for (let i = 0; i < actionCount; i++) {
      const href = await actions.nth(i).getAttribute("href");
      const response = await page.request.get(href!);
      expect(response.status(), `${href} is a real page`).toBeLessThan(400);
    }

    // The footnote that keeps the numbers honest about their own limits.
    await expect(insights).toContainText(/most recent answer per card/);
  });

  test("library: everything you have made, in one place you can search and file", async () => {
    // Something of each kind, made where it is normally made — the library is
    // an index, so it has to pick things up without being told about them.
    const cardFront = `Übungsaufgabe Osmose ${Date.now()}`;
    await page.goto("/school/flashcards");
    await page.fill('input[name="front"]', cardFront);
    await page.fill('input[name="back"]', "Wasser wandert zur höheren Konzentration");
    await page.getByRole("button", { name: "Add card" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: cardFront })).toBeVisible();

    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Your study space." })).toBeVisible();

    const items = page.getByTestId("library-items");
    await expect(items.getByText(cardFront)).toBeVisible();

    // The sidebar says how much is in there, like the rest of the app says
    // what it knows. It is a desktop-only element, and this viewport is wide.
    await expect(page.locator('nav a[href="/library"]')).toContainText(/\d/);

    // Tabs carry real counts, and they add up.
    const tabs = page.getByTestId("library-tabs");
    await expect(tabs).toContainText("Flashcards");
    await expect(tabs).toContainText("Recordings");
    const tabText = await tabs.innerText();
    const [all, flash, notes, recordings] = [...tabText.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
    expect(flash + notes + recordings, "the tab counts add up to All").toBe(all);

    // Searching without the umlaut finds the word that has one — nobody
    // reaches for the ü key on a phone.
    await page.getByTestId("library-search").fill("ubungsaufgabe");
    await expect(items.getByText(cardFront)).toBeVisible();
    await expect(page.getByTestId("library-result-count")).toContainText(/of/);

    // A search that matches nothing says so, instead of looking empty.
    await page.getByTestId("library-search").fill("zzzznothinghere");
    await expect(page.getByText(/Nothing matches/)).toBeVisible();
    await page.getByTestId("library-search").fill("");
    await expect(items.getByText(cardFront)).toBeVisible();

    // A folder, made and named in your own words.
    const folderName = `Biologie ${Date.now()}`;
    await page.getByRole("button", { name: /Create folder|New folder/ }).click();
    await page.fill('input[name="name"]', folderName);
    await page.getByRole("button", { name: "Create folder" }).click();
    await expect(page.getByTestId("library-folders")).toContainText(folderName);

    // The same name twice is refused with a sentence, not a crash.
    await page.fill('input[name="name"]', folderName);
    await page.getByRole("button", { name: "Create folder" }).click();
    await expect(page.getByTestId("create-folder-form").getByRole("alert")).toContainText(/already have a folder/i);

    // File the card, and the folder's count follows it.
    const card = page.locator('[data-testid^="library-item-flashcard-"]').filter({ hasText: cardFront });
    await card.locator("select").selectOption({ label: folderName });
    await expect(page.getByTestId("library-folders").locator("div", { hasText: folderName }).first()).toContainText("1");

    // And the folder view holds it.
    const folderLink = page.getByTestId("library-folders").getByRole("link", { name: new RegExp(folderName) });
    await folderLink.click();
    await expect(page.getByTestId("library-items").getByText(cardFront)).toBeVisible();
    await expect(page.getByTestId("library-result-count")).toContainText(/1 of/);

    // Deleting the folder must NOT delete what was inside it.
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: `Delete folder ${folderName}` }).click();
    await expect(page.getByTestId("library-folders")).toHaveCount(0);

    await page.goto("/library");
    await expect(page.getByTestId("library-items").getByText(cardFront)).toBeVisible();

    // A folder id that is not this account's shows the whole library rather
    // than an empty page that looks like the material is gone.
    await page.goto("/library?folder=not-a-real-folder-id");
    await expect(page.getByTestId("library-items").getByText(cardFront)).toBeVisible();

    // Junk in the query string falls back instead of breaking the page.
    await page.goto("/library?type=banana&sort=%3Cscript%3E&view=nope");
    await expect(page.getByTestId("library-items").getByText(cardFront)).toBeVisible();
    await expect(page.getByTestId("library-sort")).toHaveValue("NEWEST");
  });

  test("progress: School, Gym and Football each get their own plan, never a shared one", async () => {
    // The whole requirement in one test: three plans, three pages, and no
    // number that mixes them. A single combined score would hide exactly what
    // these are for.
    const seen: { path: string; title: string; completed: string; next: string }[] = [];

    for (const [path, title] of [
      ["/school", "School progress"],
      ["/gym", "Gym progress"],
      ["/football", "Football progress"],
    ] as const) {
      await page.goto(path);
      const panel = page.locator("#progress");
      await expect(panel, `${path} has its own progress plan`).toBeVisible();
      await expect(panel.getByRole("heading", { name: title })).toBeVisible();

      // It must not carry the other two domains' plans with it.
      for (const other of ["School progress", "Gym progress", "Football progress"].filter((t) => t !== title)) {
        await expect(page.getByRole("heading", { name: other })).toHaveCount(0);
      }

      // Five figures: completed, remaining, progress, and two of this
      // domain's own.
      await expect(panel.getByTestId("progress-stats").locator("> div")).toHaveCount(5);

      const stats = await panel.getByTestId("progress-stats").innerText();
      seen.push({
        path,
        title,
        completed: stats.split("\n")[0],
        next: await panel.getByTestId("next-up").innerText(),
      });

      // Completed + Remaining is the length of the list, on every page.
      const tabs = await panel.getByTestId("milestone-tabs").innerText();
      const [all, completed, remaining] = [...tabs.matchAll(/\((\d+)\)/g)].map((m) => Number(m[1]));
      expect(completed + remaining, `${path} tab counts add up`).toBe(all);
      expect(all).toBeGreaterThan(5);

      // Every milestone says a real number against a real target, never NaN.
      const rows = panel.getByTestId("milestone-list").locator("> li");
      expect(await rows.count()).toBe(all);
      await expect(panel).not.toContainText("NaN");
      await expect(panel).not.toContainText("Infinity");
      await expect(panel).not.toContainText("undefined");
    }

    // The three plans are genuinely different plans, not one rendered thrice.
    expect(new Set(seen.map((s) => s.next)).size, "each domain proposes its own next step").toBeGreaterThan(1);

    // Filtering one page's milestones does not leave that page.
    await page.goto("/gym");
    const gym = page.locator("#progress");
    await gym.getByRole("link", { name: /^Remaining/ }).click();
    await expect(page).toHaveURL(/\/gym/);
    const remainingRows = gym.getByTestId("milestone-list").locator('> li[data-done="true"]');
    await expect(remainingRows).toHaveCount(0);

    await gym.getByRole("link", { name: /^Completed/ }).click();
    await expect(page).toHaveURL(/\/gym/);
    const completedRows = gym.getByTestId("milestone-list").locator('> li[data-done="false"]');
    await expect(completedRows).toHaveCount(0);

    // Searching narrows the list and the tab counts follow it.
    await page.goto("/gym");
    await gym.getByTestId("milestone-search").fill("nutrition");
    await expect(gym.getByTestId("milestone-list").locator("> li").first()).toBeVisible();
    const narrowed = await gym.getByTestId("milestone-tabs").innerText();
    const narrowedAll = Number([...narrowed.matchAll(/\((\d+)\)/g)][0][1]);
    expect(await gym.getByTestId("milestone-list").locator("> li").count()).toBe(narrowedAll);

    // Junk in the milestone parameters falls back rather than breaking.
    await page.goto("/football?mtab=banana&mq=" + "x".repeat(200));
    await expect(page.locator("#progress").getByRole("heading", { name: "Football progress" })).toBeVisible();
  });

  test("analytics: three blocks, a donut, and subject names cut to the subject", async () => {
    // A subject named the way a real timetable names one. On the axis this
    // used to wrap to three lines and squeeze the plot into a sliver.
    await page.goto("/school");
    const longName = `German — First Language ${Date.now()}`;
    const subjectForm = page.locator("form", { has: page.locator('input[name="teacher"]') });
    await subjectForm.locator('input[name="name"]').fill(longName);
    await subjectForm.getByRole("button", { name: "Add subject" }).click();
    await expect(chemistryCard(page).or(subjectLink(page, "German"))).toBeVisible();

    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();

    // One block per domain, in order, so you can look at one without reading
    // all three.
    for (const title of ["Overview", "School", "Gym", "Football"]) {
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }

    // The circle chart, with every slice directly labelled — the app's gym
    // orange and football green are close enough for red-green colour
    // blindness that the labels are what carry identity.
    const legend = page.getByTestId("effort-legend");
    if (await legend.count()) {
      const text = await legend.innerText();
      expect(text).toMatch(/School|Gym|Football/);
      expect(text).toMatch(/%/);
    } else {
      await expect(page.getByText(/Nothing logged yet/)).toBeVisible();
    }

    // The axis says the subject, not the paper.
    const school = page.locator("section, div").filter({ hasText: "Subject progress" }).last();
    await expect(school).not.toContainText("First Language");
    await expect(school).not.toContainText("A-Level");

    // No chart draws a bare grid with nothing on it: an empty plot reads as a
    // chart that failed to load, so each either has bars or says in words that
    // there is nothing. Asserted on both, because "it rendered something" was
    // the weak version of this check and it passed on the heading alone.
    for (const id of ["gym-consistency", "football-consistency"]) {
      const card = page.getByTestId(id);
      const bars = await card.locator(".recharts-bar-rectangle").count();
      if (bars === 0) {
        await expect(card, `${id} says why it is empty`).toContainText(/last eight weeks/i);
      } else {
        expect(bars, `${id} drew real bars`).toBeGreaterThan(0);
      }
    }

    // A win rate of 0% would be a claim about matches; with none played the
    // truth is that there is nothing to report, and the tile shows a dash.
    const winRate = page.getByTestId("win-rate");
    await expect(winRate).toContainText(/^(—|\d+%)/);
  });

  test("school: the pages and decks you revise from, saved as links and never opened", async () => {
    await page.goto("/school");
    const panel = page.getByTestId("revision-sources");
    await expect(panel).toBeVisible();

    /**
     * The form stays open after a save, so the "Add a link" button is gone by
     * the second link. Clicking a button that is not there does not fail fast
     * — Playwright waits the full timeout for it to appear, and .catch() does
     * not shorten that wait, which is how this test first ran out of time.
     */
    const openForm = async () => {
      const form = page.getByTestId("add-revision-link");
      if ((await form.count()) === 0) {
        await panel.getByRole("button", { name: /Add a link/ }).click();
      }
      return form;
    };

    // A Carousel Learning deck. The app recognises what it is from the
    // address, so the form starts on the right answer.
    const form = await openForm();
    const deckUrl = "https://app.carousel-learning.com/quiz/58669cfa-9905-450d-a085-e203fda94606/revise";
    await form.locator('input[name="url"]').fill(deckUrl);
    await expect(form).toContainText("Carousel Learning");
    await expect(form.locator('select[name="kind"]')).toHaveValue("FLASHCARDS");

    const deckName = `Heart deck ${Date.now()}`;
    await form.locator('input[name="title"]').fill(deckName);
    await form.locator('select[name="subjectId"]').selectOption({ index: 1 });
    await form.getByRole("button", { name: "Save link" }).click();
    await expect(panel.getByTestId("revision-links").first()).toContainText(deckName);

    // Saving said nothing at all before, while emptying the form — so you
    // could not tell a save from a failure, and the next attempt complained
    // about a field the app itself had cleared.
    await expect(form.getByRole("status"), "it says the link was saved").toContainText(/saved/i);
    expect(await form.locator('select[name="subjectId"]').inputValue(), "the subject is kept for the next link").not.toBe("");
    await expect(form.locator('input[name="url"]'), "the address is cleared for the next one").toHaveValue("");

    // A Save My Exams page with no name typed takes the service's name, so a
    // saved link never reads as a bare URL.
    const second = await openForm();
    await second.locator('input[name="url"]').fill("https://www.savemyexams.com/igcse/biology/cie/23/revision-notes/");
    await expect(second.locator('select[name="kind"]')).toHaveValue("NOTES");
    await second.getByRole("button", { name: "Save link" }).click();
    await expect(panel).toContainText("Save My Exams");

    // The value ends up in an href, so a scheme that would run code is
    // refused with a sentence — and nothing like it reaches the page.
    const third = await openForm();
    await third.locator('input[name="url"]').evaluate((el) => el.removeAttribute("type"));
    await third.locator('input[name="url"]').fill("javascript:alert(1)");
    // Picked on purpose: a refusal used to throw away the subject AND the
    // address, so the next press failed on an empty field and the whole thing
    // read as "choosing a subject breaks saving".
    await third.locator('select[name="subjectId"]').selectOption({ index: 1 });
    await third.getByRole("button", { name: "Save link" }).click();
    await expect(third.getByRole("alert")).toContainText(/full link starting with https/i);
    await expect(third.locator('input[name="url"]'), "what you typed survives a refusal").toHaveValue(
      "javascript:alert(1)"
    );
    expect(await third.locator('select[name="subjectId"]').inputValue(), "so does the subject").not.toBe("");

    await page.reload();
    expect(await page.locator('a[href^="javascript"]').count(), "no javascript: href anywhere").toBe(0);
    expect(await page.locator('a[href^="data:"]').count(), "no data: href anywhere").toBe(0);

    // A real write: still there after a reload, and it opens in a new tab
    // rather than navigating this app away.
    const saved = page.getByTestId("revision-sources").getByRole("link", { name: new RegExp(deckName) }).first();
    await expect(saved).toHaveAttribute("href", deckUrl);
    await expect(saved).toHaveAttribute("target", "_blank");
    await expect(saved).toHaveAttribute("rel", /noopener/);

    // And it can be taken back out.
    await page.getByTestId("revision-sources").getByRole("button", { name: `Delete ${deckName}` }).click();
    await expect(page.getByTestId("revision-sources").getByText(deckName)).toHaveCount(0);
  });

  test("school: a link's topic is typed, and a name that is new becomes a real topic", async () => {
    // Reported from use: the topic could only be picked from a list, and the
    // list is empty until you have made topics some other way — so the field
    // could not be used at all by the person who most needed it.
    await page.goto("/school");
    const panel = page.getByTestId("revision-sources");
    if ((await page.getByTestId("add-revision-link").count()) === 0) {
      await panel.getByRole("button", { name: /Add a link/ }).click();
    }
    const form = page.getByTestId("add-revision-link");
    const topic = form.locator('input[name="topicName"]');
    await expect(topic, "the topic can be typed in").toBeEditable();

    // A topic with no subject is refused, and what you typed stays put.
    await form.locator('input[name="url"]').fill("https://www.savemyexams.com/igcse/chemistry/cie/revision-notes/");
    await topic.fill("Rates of Reaction");
    await form.getByRole("button", { name: "Save link" }).click();
    await expect(form.getByRole("alert")).toContainText(/subject first/i);
    await expect(topic, "a refusal keeps the topic you typed").toHaveValue("Rates of Reaction");

    // With the subject chosen it saves, and the topic now exists for real.
    await form.locator('select[name="subjectId"]').selectOption({ label: "Chemistry" });
    await form.getByRole("button", { name: "Save link" }).click();
    await expect(form.getByRole("status")).toContainText(/saved/i);

    await page.goto("/school");
    await chemistryCard(page).click();
    await page.waitForURL("**/school/subjects/**");
    await expect(page.getByRole("cell", { name: /Rates of Reaction/ })).toBeVisible();
  });

  test("school: the timetable you were handed, photographed", async () => {
    // The grid the app plans with has to be typed in. The photo is right the
    // moment it is taken — including the option blocks and room numbers — so
    // it is the one you glance at.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwACRgFxfyRfSwAAAABJRU5ErkJggg==",
      "base64"
    );

    await page.goto("/school/timetable");
    await expect(page.getByText("No timetable photo yet")).toBeVisible();
    await page.setInputFiles('input[name="photo"]', { name: "timetable.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "Save photo" }).click();

    const photo = page.getByTestId("timetable-photo");
    await expect(photo).toBeVisible();
    const src = await photo.locator("img").getAttribute("src");
    expect(src, "served from this account's own folder").toMatch(/^\/uploads\//);

    // It is the file itself, not a broken image with a row pointing at it.
    const served = await page.request.get(src!);
    expect(served.status(), "the photo actually loads").toBe(200);

    // And it is on the School page, where the Timetable chip lands.
    await page.goto("/school");
    await expect(page.getByTestId("timetable-photo")).toBeVisible();

    // Taken back out again, with the file gone too.
    await page.goto("/school/timetable");
    await page.getByRole("button", { name: "Remove timetable photo" }).click();
    await expect(page.getByText("No timetable photo yet")).toBeVisible();
    expect((await page.request.get(src!)).status(), "the file is deleted, not just unlinked").toBe(404);
  });

  test("school: one tap fills in the week off the Year 12 sheet", async ({ browser }: { browser: Browser }) => {
    // Typing forty cells into a grid on a phone is the kind of job that gets
    // abandoned halfway, after which everything that reads the timetable has
    // half a week to work from. This is the whole week in one press.
    //
    // On its own account: it replaces Monday to Friday by design, which would
    // take the main account's hand-built grid with it.
    const context = await browser.newContext();
    const importer = await context.newPage();
    try {
      await importer.goto("/register");
      await importer.fill('input[name="name"]', "Year 12");
      await importer.fill('input[name="email"]', `e2e_y12_${Date.now()}@example.com`);
      await importer.fill('input[name="password"]', password);
      await importer.fill('input[name="invite"]', E2E_INVITE_CODE);
      await importer.getByRole("button", { name: /create account/i }).click();
      await importer.waitForURL(/\/onboarding|\/$/);

      // Onboarding is a gate, not a suggestion: an account that skips it is
      // sent back here from every page, timetable included.
      await importer.click('button:has-text("Continue")'); // domains
      await importer.click('button:has-text("School")');
      await importer.click('button:has-text("Continue")'); // main focus
      await importer.fill('input[placeholder*="Riverside"]', "ISCS");
      await importer.click('button:has-text("Continue")'); // school
      await importer.click('button:has-text("Continue")'); // gym
      await importer.click('button:has-text("Continue")'); // football
      await importer.click('button:has-text("Finish setup")');
      await importer.waitForURL("/");

      // A subject that is already there, spelled the way someone actually
      // types it. It must be matched, not duplicated: a second Economics
      // would take the lessons while the topics, flashcards, homework and
      // revision links stayed behind on the first one.
      await importer.goto("/school");
      await importer.fill('input[placeholder="Subject name"]', "economics");
      await importer.click('button:has-text("Add subject")');
      await expect(subjectLink(importer, "economics")).toBeVisible();

      await importer.goto("/school/timetable");
      await importer.getByTestId("import-year12").click();
      const report = importer.getByRole("status");
      await expect(report).toContainText("Monday to Friday");
      await expect(report, "the one already there was not created again").not.toContainText("Economics");

      // The subjects it needed were created, not assumed to be there.
      await importer.goto("/school");
      for (const name of ["German", "English", "EPQ", "Maths"]) {
        await expect(subjectLink(importer, name), `${name} is missing`).toBeVisible();
      }
      // And still exactly one Economics, the one that was already there.
      await expect(subjectLink(importer, "economics")).toHaveCount(1);

      // The grid holds real lessons linked to those subjects...
      await importer.goto("/school/timetable");
      await expect(importer.locator('input[value="economics"]').first()).toBeVisible();
      expect(await importer.locator('input[value="German"]').count(), "five German periods").toBe(5);
      // ...and the free periods say why they are free, rather than being blank.
      await expect(importer.locator('input[value="Free — Maths with Year 11"]').first()).toBeVisible();

      // Pressing it again leaves the same week, not two overlapping copies.
      //
      // Counted in the data, not on the page: both the editor and the diagram
      // show one cell per day and period, so a second slot sitting underneath
      // the first is invisible in either. The backup is the rows themselves.
      const countSlots = async () => {
        const archive = await importer.request.get("/api/export");
        expect(archive.status()).toBe(200);
        const dir = mkdtempSync(path.join(tmpdir(), "momentum-e2e-y12-"));
        const file = path.join(dir, "backup.tar.gz");
        writeFileSync(file, await archive.body());
        execFileSync("tar", ["-xzf", file, "-C", dir]);
        const root = readdirSync(dir).find((entry) => entry.startsWith("momentum-backup-"))!;
        const data = JSON.parse(readFileSync(path.join(dir, root, "data.json"), "utf8"));
        return (data.timetableSlots as unknown[]).length;
      };

      const first = await countSlots();
      expect(first, "the whole week is in the database").toBe(52);

      await importer.getByTestId("import-year12").click();
      await expect(importer.getByRole("status")).toContainText("Monday to Friday");
      expect(await countSlots(), "still one week, not two stacked on each other").toBe(first);
    } finally {
      await context.close();
    }
  });

  test("school: the jump bar reaches every section it names", async () => {
    // The page is about twenty phone screens. The bar is the way in, and a
    // chip pointing at a section that was renamed or removed would scroll
    // nowhere while still looking like a working button.
    await page.goto("/school");
    const bar = page.getByTestId("section-jump");
    await expect(bar).toBeVisible();

    const hrefs = await bar.locator("a").evaluateAll((links) => links.map((l) => l.getAttribute("href") ?? ""));
    expect(hrefs.length, "the bar has chips at all").toBeGreaterThan(3);

    for (const href of hrefs) {
      const id = href.replace("#", "");
      await expect(page.locator(`#${id}`), `the "${id}" chip points at a section that exists`).toHaveCount(1);
    }

    // And tapping one actually moves the page to it. Sticky positioning and
    // anchor scrolling both break silently inside a scroll container, which
    // is exactly what an overflow-hidden wrapper turns its parent into.
    await page.evaluate(() => window.scrollTo(0, 0));
    await bar.getByRole("link", { name: "Tutor" }).click();
    await page.waitForTimeout(600);
    const top = await page.locator("#tutor").evaluate((el) => el.getBoundingClientRect().top);
    expect(top, "the tutor section is at the top of the screen, not below the fold").toBeLessThan(200);
    expect(await page.evaluate(() => window.scrollY), "the page itself scrolled").toBeGreaterThan(100);
  });

  test("school: each subject's two slots, and its deck on the flashcards page", async () => {
    // The point of the grid is that a missing link is visible BEFORE you need
    // it. So this walks one subject from nothing saved, through one paste, to
    // the deck being one tap away from the page you revise on.
    await page.goto("/school");
    const subjectName = `Physics ${Date.now()}`;
    const subjectForm = page.locator("form", { has: page.locator('input[name="teacher"]') });
    await subjectForm.locator('input[name="name"]').fill(subjectName);
    await subjectForm.getByRole("button", { name: "Add subject" }).click();

    const card = page
      .getByTestId("subject-links-grid")
      .locator('[data-testid^="subject-links-"]', { hasText: subjectName });
    await expect(card).toBeVisible();

    // Nothing saved for it yet: both slots say so, in words that tell you what
    // to go and fetch rather than pretending the app could fetch it.
    await expect(card).toContainText("Look it up — paste");
    await expect(card).toContainText("Test yourself — paste");

    const deckUrl = `https://app.carousel-learning.com/quiz/${crypto.randomUUID()}/revise`;
    const deckName = `Forces deck ${Date.now()}`;
    const panel = page.getByTestId("revision-sources");
    if ((await page.getByTestId("add-revision-link").count()) === 0) {
      await panel.getByRole("button", { name: /Add a link/ }).click();
    }
    const form = page.getByTestId("add-revision-link");
    await form.locator('input[name="url"]').fill(deckUrl);
    await form.locator('input[name="title"]').fill(deckName);
    await form.locator('select[name="subjectId"]').selectOption({ label: subjectName });
    await form.getByRole("button", { name: "Save link" }).click();

    // One paste fills exactly one slot. The other stays empty — a link saved
    // for one job must never be offered as the answer to the other.
    const testYourself = card.getByRole("link", { name: /Test yourself/ });
    await expect(testYourself).toHaveAttribute("href", deckUrl);
    await expect(card).toContainText("Look it up — paste");

    // And it shows up where you go to test yourself, which is the whole
    // reason for saving it: no remembering which site the deck lives on.
    await page.goto("/school/flashcards");
    const chip = page.getByTestId("carousel-decks").getByRole("link", { name: new RegExp(deckName) });
    await expect(chip).toHaveAttribute("href", deckUrl);
    await expect(chip).toHaveAttribute("target", "_blank");
    await expect(chip).toHaveAttribute("rel", /noopener/);
  });

  test("school ai: its own tutor, separate from the coach, that takes a stack of photos", async () => {
    // A 1x1 PNG. The point is which files are accepted and where they end up,
    // not what is in them.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );

    // The tutor is part of the School page now, not a separate destination.
    // The old address still works for anyone who bookmarked it, but it lands
    // in the same one place rather than rendering a second copy.
    await page.goto("/school/ai");
    await page.waitForURL("**/school**");
    expect(new URL(page.url()).pathname, "the old address redirects into School").toBe("/school");

    await page.goto("/school");
    await page.click('a[href="/school#school-ai"]');
    await expect(page.getByTestId("school-ai-section-title")).toBeVisible();

    // And it is not a row in the sidebar any more — one School, not two.
    await expect(page.locator('nav a[href="/school/ai"]')).toHaveCount(0);

    // An unrelated photo of this account's, in the same upload directory, put
    // there before any of the school-AI work. Discarding a staged photo is a
    // delete driven by a path from the browser, and "under your own folder" is
    // just as true of this one — so it is here to show the delete cannot reach
    // a photo the school AI never staged.
    await page.goto("/gym/history");
    await page.setInputFiles('input[name="photo"]', {
      name: "unrelated.png",
      mimeType: "image/png",
      buffer: makeNoisyPng(80, 80),
    });
    await page.fill('input[name="caption"]', "Not the school AI's photo");
    await page.getByRole("button", { name: "Add photo" }).click();
    await expect(page.getByText("Not the school AI's photo")).toBeVisible();
    const unrelated = await page.locator('img[src^="/uploads/"]').first().getAttribute("src");
    expect(unrelated, "the unrelated progress photo just uploaded").toBeTruthy();

    await page.goto("/school");
    const input = page.getByTestId("school-ai-photo-input");

    // First, one photo the size a phone actually takes. Every upload in this
    // app is a Server Action, and Next.js rejects a Server Action body over
    // 1MB with a 413 — so the 1x1 PNGs everywhere else in this suite prove
    // nothing about whether a real photograph can be sent at all.
    await input.setInputFiles([{ name: "real-size.png", mimeType: "image/png", buffer: makeNoisyPng(900, 900) }]);
    await expect(page.getByTestId("school-ai-staged").locator("img")).toHaveCount(1);
    await page.getByTestId("school-ai-staged").locator("button").first().click();
    await expect(page.getByTestId("school-ai-staged")).toHaveCount(0);

    // Two pages of the same question go up together, and both come back as
    // thumbnails before anything is sent — the whole reason upload and ask are
    // two steps is being able to drop the blurry one.
    await input.setInputFiles([
      { name: "page1.png", mimeType: "image/png", buffer: png },
      { name: "page2.png", mimeType: "image/png", buffer: png },
      { name: "page3.png", mimeType: "image/png", buffer: png },
    ]);
    const staged = page.getByTestId("school-ai-staged");
    await expect(staged.locator("img")).toHaveCount(3);

    // Drop one, and it is gone from what will be sent — and the file itself is
    // deleted, not just hidden. A discarded photo that stayed on disk could
    // never be identified again, because nothing else knows it was staged.
    const dropped = await staged.locator("img").first().getAttribute("src");
    expect((await page.request.get(dropped!)).status()).toBe(200);
    await staged.locator("button").first().click();
    await expect(staged.locator("img")).toHaveCount(2);
    await expect
      .poll(async () => (await page.request.get(dropped!)).status())
      .not.toBe(200);

    // An iPhone's default format uploads fine and the AI cannot read it, so it
    // has to be refused out loud here rather than silently never looked at.
    await input.setInputFiles([{ name: "photo.heic", mimeType: "image/heic", buffer: png }]);
    await expect(page.getByText(/Most Compatible/)).toBeVisible();
    await expect(staged.locator("img")).toHaveCount(2);

    const question = `Mark my working on this ${Date.now()}`;
    await page.fill('input[name="message"]', question);
    // Scoped to the chat's own form: `form button[type="submit"]` also matches
    // the sidebar's sign-out form, and clicking that ends the session instead
    // of sending the question.
    await page.locator('form:has(input[name="message"]) button[type="submit"]').click();

    // The reply can only come from the server, so waiting for it is what marks
    // the end of the round trip. Without a connected AI it says so plainly
    // rather than inventing an answer.
    await expect(page.getByText(/school AI needs a connected AI service/)).toBeVisible();

    // Then reload, and assert against what actually persisted. The panel shows
    // the question and its thumbnails optimistically the moment you press send,
    // so asserting before a reload passes even when the server stored neither —
    // which is exactly what happened the first time this test was written.
    await page.reload();
    await expect(page.getByText(question)).toBeVisible();
    const thumbnails = page.getByAltText("Photo sent to your school AI");
    await expect(thumbnails).toHaveCount(2);

    // And the files behind them are really there, served by the app's own
    // owner-checked route rather than showing as two broken images.
    for (const src of await thumbnails.evaluateAll((imgs) => imgs.map((i) => i.getAttribute("src") ?? ""))) {
      expect(src.startsWith("/uploads/"), src).toBe(true);
      expect((await page.request.get(src)).status(), src).toBe(200);
    }

    // And the unrelated photo is untouched by everything above.
    expect((await page.request.get(unrelated!)).status(), unrelated!).toBe(200);

    // The point of this page: it is a different conversation from the
    // all-domains coach, not a second window onto the same one.
    await page.goto("/coach");
    await expect(page.getByText(question)).toHaveCount(0);
  });

  test("gym: create a workout plan", async () => {
    await page.goto("/gym");
    await page.fill('input[placeholder="e.g. Upper Body"]', "Leg Day");
    await page.click('button:has-text("Add plan")');
    // The plan's own card, not the "not on a day yet" hint that also names it.
    await expect(page.getByText("Leg Day", { exact: true }).first()).toBeVisible();
  });

  test("gym: a meal box is open on arrival, and takes whatever you type", async () => {
    await page.goto("/gym");

    // One section open, not four: the entry field is in front of you without
    // burying the day's overview.
    const openForms = page.locator('input[name="description"]');
    await expect(openForms).toHaveCount(1);
    await expect(openForms.first()).toBeVisible();

    // The suggestion list is a shortcut, not a menu you must pick from — that
    // is what made this feel like the app refused your own wording.
    await expect(openForms.first()).toHaveAttribute("placeholder", /however you like/);
    await expect(page.getByText(/the suggestions are only a shortcut/)).toBeVisible();

    const form = page.locator('form:has(input[name="description"])').first();
    await openForms.first().fill("Zwei Spiegeleier, Brot und ein Apfel vom Baum");
    await expect(openForms.first()).toHaveValue(/Apfel vom Baum/);

    // Free text fills nothing in behind your back.
    for (const field of ["kcal", "proteinG", "carbsG", "fatG"]) {
      await expect(form.locator(`[name="${field}"]`)).toHaveValue("");
    }
  });

  test("gym: example days hit the protein goal with real listed food", async () => {
    await page.goto("/gym/meal-plan");

    const heading = await page.getByRole("heading", { name: "Example days" }).textContent();
    expect(heading).toBe("Example days");

    // The page is built around whatever protein goal this account has, not a
    // hardcoded number, so read it back and check everything against it.
    const intro = await page.locator("main p").first().textContent();
    const goal = Number(intro?.match(/around your (\d+)g protein goal/)?.[1]);
    expect(Number.isFinite(goal)).toBe(true);

    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
      await expect(page.getByRole("heading", { name: day, exact: true })).toBeVisible();
    }
    await expect(page.getByText("Day total", { exact: true })).toHaveCount(5);

    // Each day runs breakfast first and dinner last, with macros on every meal.
    const cards = page.locator("div.rounded-2xl").filter({ hasText: "Day total" });
    await expect(cards).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      const meals = cards.nth(i).locator("li");
      await expect(meals.first()).toContainText("Breakfast");
      await expect(meals.last()).toContainText("Dinner");
      await expect(meals.first()).toContainText(/P \d+g/);
      await expect(meals.first()).toContainText(/C \d+g/);
      await expect(meals.first()).toContainText(/F \d+g/);
    }

    // Each day's badge states its protein against the goal, and the arithmetic
    // has to agree with the goal the page just told us about.
    const body = (await page.locator("main").textContent()) ?? "";
    const badges = [...body.matchAll(/(\d+)g protein — (?:exactly on goal|(\d+)g (over|short of) (\d+)g)/g)];
    expect(badges).toHaveLength(5);
    for (const [, total, delta, direction, against] of badges) {
      if (delta === undefined) {
        expect(Number(total)).toBe(goal);
      } else {
        expect(Number(against)).toBe(goal);
        expect(direction === "over" ? Number(total) - goal : goal - Number(total)).toBe(Number(delta));
      }
    }

    // Regenerating has to actually produce a different plan. Compared across the
    // whole week, not one day: two variants can legitimately land on the same
    // Monday, so asserting on a single card is a coin flip.
    const weekOf = (locator: typeof cards) => locator.evaluateAll((els) => els.map((e) => e.textContent).join("|"));
    const before = await weekOf(cards);

    // Waiting on the heading would prove nothing — it is on the page before and
    // after — so wait for the navigation itself, or the old week gets read back.
    const regenerate = page.locator('a[href*="variant="]').first();
    const target = await regenerate.getAttribute("href");
    await regenerate.click();
    await page.waitForURL(`**${target}`);
    const after = await weekOf(page.locator("div.rounded-2xl").filter({ hasText: "Day total" }));
    expect(after).not.toBe(before);
  });

  test("gym: a barcode can be read from a photo, not only from a live camera", async () => {
    await page.goto("/gym/scanner");

    // Live scanning needs the camera to hold focus on a small striped
    // rectangle, which on a phone often simply never happens — and a camera
    // that shows a picture but never reads anything looks broken. So there is
    // a second way in, and it has to actually decode a real barcode.
    await expect(page.getByRole("button", { name: /Take a photo/ })).toBeVisible();

    const barcode = "4006381333931";
    await page.getByTestId("barcode-photo-input").setInputFiles({
      name: "barcode.png",
      mimeType: "image/png",
      buffer: ean13Png(barcode),
    });

    // Reading the photo fills the barcode box and submits the lookup.
    await expect(page.locator('input[name="barcode"]')).toHaveValue(barcode, { timeout: 20000 });

    // A photo with no barcode in it says what to do differently rather than
    // failing silently.
    await page.getByTestId("barcode-photo-input").setInputFiles({
      name: "not-a-barcode.png",
      mimeType: "image/png",
      buffer: makeNoisyPng(120, 120),
    });
    await expect(page.getByText(/No barcode found in that photo/)).toBeVisible({ timeout: 20000 });
  });

  test("football: save profile and generate training", async () => {
    await page.goto("/football");
    await page.selectOption('select[name="position"]', "ST");
    await page.fill('input[name="teamName"]', "Test FC");
    await page.click('button:has-text("Save profile")');
    // The hero button, not the inline link the empty league table also renders.
    await expect(page.locator('a[href="/football/team"]').first()).toBeVisible();

    await page.click('button:has-text("Generate individual training")');
    await page.reload();
    await expect(page.getByText("🎯 Individual Training")).toBeVisible();
  });

  test("football: a match says when, where and what else you need to know", async () => {
    // Asked for: somewhere to write down when and where, at what time. A
    // fixture list gives you none of the last part — which pitch, what time to
    // be there, which kit — and that is the half you actually look up on the
    // morning of the game.
    await page.goto("/football");

    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const when = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T14:00`;

    // Scoped to the match form: the training form above it has a date field
    // of its own, and an unscoped fill lands in that one and leaves this empty.
    const form = page.getByTestId("match-form");
    await form.locator('input[name="opponent"]').fill("FC Baar");
    await form.locator('input[name="date"]').fill(when);
    await form.locator('input[name="location"]').fill("Sportplatz Herti, Zug — pitch 2");
    await form.locator('textarea[name="notes"]').fill("Besammlung 13:00\nRotes Trikot");
    await expect(form.locator('input[name="date"]'), "the date really went in").toHaveValue(when);
    await form.getByRole("button", { name: "Add match" }).click();

    const match = page.getByRole("listitem").filter({ hasText: "FC Baar" }).first();
    await expect(match).toContainText("14:00");
    await expect(match).toContainText("Sportplatz Herti, Zug — pitch 2");
    await expect(match).toContainText("Besammlung 13:00");
    // The line breaks in the note survive, so it reads as the list it is.
    await expect(match).toContainText("Rotes Trikot");

    // It reaches the places you look on the day, not only the form you typed it into.
    await expect(
      page.getByTestId("upcoming-opponents"),
      "the opponents card repeats where and when"
    ).toContainText("Sportplatz Herti");

    // The day view for that date, not the default week: a fixture five days
    // out falls into next week as often as not, so a week-view assertion
    // fails on a Thursday and passes on a Monday. The month view is no good
    // either — it draws a coloured dot per day, not the titles.
    const day = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`;
    await page.goto(`/calendar?view=day&date=${day}`);
    await expect(page.getByText(/Match vs FC Baar · Sportplatz Herti/).first()).toBeVisible();

    // A match with no place still says the one thing you always know.
    await page.goto("/football");
    const form2 = page.getByTestId("match-form");
    await form2.locator('input[name="opponent"]').fill("SC Cham");
    await form2.locator('input[name="date"]').fill(when);
    await form2.locator('input[name="isHome"]').uncheck();
    await form2.getByRole("button", { name: "Add match" }).click();
    const away = page.getByRole("listitem").filter({ hasText: "SC Cham" }).first();
    await expect(away).toContainText("Away");

    await away.locator('button[type="submit"]').click();
    await expect(page.getByRole("listitem").filter({ hasText: "SC Cham" })).toHaveCount(0);
  });

  test("football: every skill has a cue, and the ones without a video say so and take yours", async () => {
    await page.goto("/football");
    const library = page.getByTestId("drill-library");
    // Scoped to the library: the page also has "Save profile" and a "Save" per
    // generated drill, and an unscoped button:has-text("Save") finds those too.
    const save = library.locator('form:has(input[name="drillVideoUrl"]) button[type="submit"]');

    // Skills the app can suggest a real video for show one and say how many.
    await library.getByRole("button", { name: "Tackling", exact: true }).click();
    await expect(page.getByTestId("drill-suggested").locator("iframe")).toHaveCount(1);

    // Agility was in the skill list with neither a cue nor a video: selecting it
    // printed "💡 undefined" and "No example video for this one yet."
    await library.getByRole("button", { name: "Agility", exact: true }).click();
    await expect(page.getByText(/undefined/)).toHaveCount(0);
    await expect(page.getByText(/change direction on one step/)).toBeVisible();

    // No suggestion, so it says why rather than pretending — and offers a search.
    await expect(page.getByText(/never guesses a video link/)).toBeVisible();
    const search = page.getByRole("link", { name: /Find more Agility drills/ });
    await expect(search).toHaveAttribute("href", /^https:\/\/www\.youtube\.com\/results\?search_query=/);

    // A link that can run code never becomes an href, even though it is yours.
    await library.locator('input[name="drillVideoUrl"]').fill("javascript:alert(1)");
    await save.click();
    await expect(page.getByText(/Paste a full http\(s\) link/)).toBeVisible();

    // A real one saves, embeds as a video, and survives a reload.
    await library.locator('input[name="drillVideoUrl"]').fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await library.locator('input[name="drillVideoLabel"]').fill("Coach's ladder drill");
    await save.click();
    await expect(page.getByTestId("drill-saved").locator("iframe")).toHaveCount(1);

    await page.reload();
    await page.getByTestId("drill-library").getByRole("button", { name: "Agility", exact: true }).click();
    const saved = page.getByTestId("drill-saved");
    await expect(saved.locator("iframe")).toHaveCount(1);
    await expect(saved.locator("iframe")).toHaveAttribute("src", "https://www.youtube.com/embed/dQw4w9WgXcQ");
    await expect(saved.getByText("Coach's ladder drill")).toBeVisible();

    // And it belongs to Agility alone, not to every skill.
    await page.getByTestId("drill-library").getByRole("button", { name: "Heading", exact: true }).click();
    await expect(page.getByTestId("drill-saved")).toHaveCount(0);
  });

  test("football: the league's own pages, saved as links that always work", async () => {
    // Reported: the real league link can't be added. The importer asks this
    // server to fetch the page, and matchcenter.el-pl.ch answers 403 to
    // anything that is not a browser — nothing this app can fix. A link is the
    // one route that cannot fail for a reason outside the app: the phone
    // opening it IS a browser.
    await page.goto("/football");
    const panel = page.getByTestId("league-links");
    await expect(panel).toBeVisible();

    // A link that would run code when the button is tapped never becomes one.
    // The box takes plain text so this reaches the check that refuses it —
    // behind type="url" the browser blocked it first, with a bubble that says
    // "enter a URL" and leaves you no wiser about why yours was refused.
    await panel.locator('input[name="url"]').fill("javascript:alert(1)");
    await panel.getByRole("button", { name: "Save link" }).click();
    await expect(panel.getByRole("alert")).toContainText(/no web address/i);
    await expect(panel.locator("a[href^='javascript']")).toHaveCount(0);

    // What a phone actually hands you: the address bar without its scheme.
    // This was refused as "not a web address" when it is exactly the address.
    await panel.locator('input[name="url"]').fill("www.football.ch/gruppe/7");
    await panel.locator('select[name="kind"]').selectOption("RESULTS");
    await panel.getByRole("button", { name: "Save link" }).click();
    await expect(panel.getByRole("link", { name: /Results/ })).toHaveAttribute(
      "href",
      "https://www.football.ch/gruppe/7"
    );
    await panel.getByRole("button", { name: "Remove Results" }).click();
    await expect(panel.getByRole("link", { name: /Results/ })).toHaveCount(0);

    // The real one — the exact page that the importer is refused by.
    const leagueUrl = "https://matchcenter.el-pl.ch/default.aspx?v=397&oid=3&lng=1&t=31562&a=trr";
    await panel.locator('input[name="url"]').fill(leagueUrl);
    await panel.locator('select[name="kind"]').selectOption("TABLE");
    await panel.locator('input[name="title"]').fill("Tabelle 2. Liga");
    await panel.getByRole("button", { name: "Save link" }).click();

    const tableLink = panel.getByRole("link", { name: /Tabelle 2\. Liga/ });
    await expect(tableLink).toHaveAttribute("href", leagueUrl);
    await expect(tableLink).toHaveAttribute("target", "_blank");
    await expect(tableLink).toHaveAttribute("rel", /noopener/);
    // It says which site it goes to, so a stale link is recognisable.
    await expect(panel.getByText("matchcenter.el-pl.ch")).toBeVisible();

    // A second one, unnamed: it is named after what it is. Typing the kind in
    // the box as well would be work, and naming it after the host would give
    // two buttons both reading matchcenter.el-pl.ch.
    await panel.locator('input[name="url"]').fill("https://www.football.ch/gruppe/42");
    await panel.locator('select[name="kind"]').selectOption("FIXTURES");
    await panel.getByRole("button", { name: "Save link" }).click();
    await expect(panel.getByRole("link", { name: /Fixtures/ })).toBeVisible();

    // Both survive a reload, table first — the order you want them in, not the
    // order they were typed.
    await page.reload();
    const names = await page.getByTestId("league-links").locator("a .font-medium").allInnerTexts();
    expect(names).toEqual(["Tabelle 2. Liga", "Fixtures"]);

    // And on the team page, which is where you land from the table card.
    await page.goto("/football/team");
    await expect(page.getByTestId("league-links").getByRole("link", { name: /Tabelle 2\. Liga/ })).toBeVisible();

    // Taken back out again.
    await page.getByTestId("league-links").getByRole("button", { name: "Remove Tabelle 2. Liga" }).click();
    await expect(page.getByTestId("league-links").getByRole("link", { name: /Tabelle 2\. Liga/ })).toHaveCount(0);
    await expect(page.getByTestId("league-links").getByRole("link", { name: /Fixtures/ })).toBeVisible();
  });

  test("football: when the page can't be read, the table can be pasted", async () => {
    // Reported: a real league link comes back as an error. Some league pages
    // build their table in the browser, and some refuse a server outright —
    // neither is something this app can fix from its own side. The browser in
    // front of the page has already seen the table, so it can be copied in.
    await page.goto("/football/team");
    await page.getByRole("button", { name: /Paste the table instead/ }).click();

    const box = page.locator('textarea[aria-label="Paste the league table"]');
    await expect(box).toBeVisible();

    // Nothing pasted: it says what to do rather than failing quietly.
    await page.getByRole("button", { name: "Read pasted table" }).click();
    await expect(page.getByText(/Paste the table itself/)).toBeVisible();

    // With a table, and no AI key in this suite on purpose: the honest
    // refusal, not an invented standing.
    await box.fill("Rang Verein Sp S U N Tore Pkt\n1 FC Zug 94 10 7 2 1 24:9 23\n2 SC Cham 10 6 3 1 19:11 21");
    await page.getByRole("button", { name: "Read pasted table" }).click();
    await expect(page.getByText(/needs a real AI/)).toBeVisible();
  });

  test("football: a photo of the table is read by the app's own AI, and checked before it counts", async () => {
    // Asked for: the AI inside the app fills in the app's own table. This is
    // the route that needs nothing from the league's website — no fetch it can
    // refuse, no page that renders only in a browser, no selecting a table
    // with a fingertip.
    await page.goto("/football/team");
    const panel = page.getByTestId("standings-photo");
    await expect(panel).toBeVisible();

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwACRgFxfyRfSwAAAABJRU5ErkJggg==",
      "base64"
    );

    // Nothing picked: it says what to do rather than failing quietly.
    await panel.locator('input[name="photo"]').setInputFiles({ name: "t.png", mimeType: "image/png", buffer: png });

    // A file that is not a picture is refused by name, not by a stack trace.
    await panel.locator('input[name="photo"]').setInputFiles({
      name: "table.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4", "utf8"),
    });
    await panel.getByRole("button", { name: "Read the photo" }).click();
    await expect(panel.getByRole("status")).toContainText(/not a picture/i);

    // And with no AI key — which is how this server runs — it says that
    // plainly instead of pretending to read the picture and saving nothing.
    // Silence here would look exactly like a photo it could not make out.
    await panel.locator('input[name="photo"]').setInputFiles({ name: "t.png", mimeType: "image/png", buffer: png });
    await panel.getByRole("button", { name: "Read the photo" }).click();
    await expect(panel.getByRole("status")).toContainText(/needs a real AI/i);

    // Nothing was saved on the way to finding that out.
    await expect(page.getByTestId("standings-preview")).toHaveCount(0);
  });

  test("football: league table, race for 1st and opponent scouting", async () => {
    await page.goto("/football");
    await expect(page.getByText("League table & race for 1st")).toBeVisible();

    // Two fixtures: one against a team that will be in the table, one that won't.
    // Scoped to the match form — the training form above it also has a date field.
    const matchForm = page.locator('form:has(input[name="opponent"])');
    for (const [opponent, day] of [["Table FC", "10"], ["Unknown Rovers", "17"]] as const) {
      await matchForm.locator('input[name="opponent"]').fill(opponent);
      await matchForm.locator('input[name="date"]').fill(`2099-01-${day}T15:00`);
      await matchForm.locator('button:has-text("Add match")').click();
      await expect(page.getByText(opponent).first()).toBeVisible();
    }

    // A two-row table: the leader ahead of us on points and goal difference.
    await page.goto("/football/team");
    const rows = [
      { rank: "1", teamName: "Table FC", played: "4", won: "4", drawn: "0", lost: "0", goalsFor: "12", goalsAgainst: "2", points: "12" },
      { rank: "2", teamName: "Test FC", played: "4", won: "1", drawn: "1", lost: "2", goalsFor: "4", goalsAgainst: "6", points: "4" },
    ];
    for (const row of rows) {
      for (const [name, value] of Object.entries(row)) {
        await page.fill(`form:has(input[name="rank"]) input[name="${name}"]`, value);
      }
      await page.click('form:has(input[name="rank"]) button:has-text("Add")');
      // The server action re-renders the table; wait for the row before filling the
      // next. Matched on the row, since our own cell also carries a "You" badge.
      await expect(page.locator("tbody tr", { hasText: row.teamName })).toBeVisible();
    }

    // Race maths: 2 teams -> a 1-match season, already played 4, so 0 left and 1st
    // is out of reach. The point is that it states that rather than inventing hope.
    const race = page.locator('div:has(> div > h3:text("Race for 1st place"))').first();
    await expect(race).toContainText("2nd");
    await expect(race).toContainText("Out of reach on points");
    await expect(race).toContainText("nothing here is invented");

    // Opponent scouting: the matched one carries table context, the other says so.
    const opponents = page.locator('div:has(> div > h3:text("Upcoming opponents"))').first();
    await expect(opponents).toContainText("1st on 12 pts");
    await expect(opponents).toContainText("six-pointer");
    await expect(opponents).toContainText("Not matched to a table row");
  });

  test("ai coach: responds to a chat message", async () => {
    await page.goto("/coach");
    const chat = page.locator('form:has(input[name="message"])');
    await chat.locator('input[name="message"]').fill("optimize my entire week");
    await chat.locator('button[type="submit"]').click();
    // The reply lands in the thread without the page navigating — a navigation
    // here would tear down an open microphone mid-conversation.
    await expect(page.locator("main")).toContainText(/School|Gym|Football|Recovery/, { timeout: 60000 });
    expect(new URL(page.url()).pathname).toBe("/coach");
  });

  test("ai coach: offers voice, and degrades honestly without a microphone", async () => {
    await page.goto("/coach");
    await expect(page.getByRole("button", { name: /Talk/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Speak replies/ })).toBeVisible();

    // Each control is only offered when the browser actually supports it.
    const caps = await page.evaluate(() => ({
      recognition: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
      synthesis: "speechSynthesis" in window,
    }));
    expect(await page.getByRole("button", { name: /Talk/ }).isEnabled()).toBe(caps.recognition);
    expect(await page.getByRole("button", { name: /Speak replies/ }).isEnabled()).toBe(caps.synthesis);

    if (caps.recognition) {
      // What a microphone does depends entirely on the machine: it may listen,
      // find no audio device, or have permission refused. The promise the app
      // makes is narrower and testable everywhere — pressing Talk either starts
      // listening or says why it didn't, and typing keeps working either way.
      // Never a dead button and never a stuck "Listening…".
      await page.getByRole("button", { name: /Talk/ }).click();
      await expect(
        page.getByText(/Listening…|No microphone was found|Microphone access was blocked|Couldn't start the microphone|speech recognition/i)
      ).toBeVisible({ timeout: 15000 });
      await expect(page.locator('input[name="message"]')).toBeEnabled();

      // And whichever happened, there is a way onward: either Stop & send (it
      // is listening) or Talk again (it isn't).
      await expect(page.getByRole("button", { name: /Stop & send|Talk/ }).first()).toBeEnabled();
    }
  });

  test("calendar: day, week and month views load", async () => {
    for (const view of ["day", "week", "month"]) {
      const res = await page.goto(`/calendar?view=${view}`);
      expect(res?.status()).toBe(200);
    }
  });

  test("tasks: add and complete a task", async () => {
    await page.goto("/tasks");
    await page.fill('input[placeholder="Task title"]', "Pack football boots");
    await page.click('button:has-text("Add")');
    await page.reload();
    await expect(page.getByText("Pack football boots")).toBeVisible();
  });

  test("uploads: a photo is private to its owner and never served from the app directory", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    // A path in the shape uploads are stored as. It doesn't need to exist: the
    // point is which requests are refused before a file is ever looked for.
    const mine = `/uploads/${"x".repeat(25)}/photo.png`;

    // Signed in, but somebody else's folder.
    const res = await page.request.get(mine, { maxRedirects: 0 });
    expect(res.status()).not.toBe(200);

    // Traversal and shapes this app never writes. Next decodes each segment
    // before the route sees it, so "..%2F.." arrives as real path syntax
    // inside what looks like one segment — which is how a request once climbed
    // out of its own folder and read another account's photo. The .png cases
    // matter most: an extension the app serves gets past every other check.
    for (const evil of [
      `/uploads/${"x".repeat(25)}/..%2Fother%2Fphoto.png`,
      `/uploads/${"x".repeat(25)}/..%252Fother%252Fphoto.png`,
      `/uploads/${"x".repeat(25)}/..%5Cother%5Cphoto.png`,
      `/uploads/${"x".repeat(25)}/%2e%2e%2fother%2fphoto.png`,
      `/uploads/${"x".repeat(25)}/%2Fetc%2Fhosts.png`,
      `/uploads/${"x".repeat(25)}/..%2f..%2fpackage.json`,
      `/uploads/${"x".repeat(25)}/nested/dir/photo.png`,
      `/uploads/${"x".repeat(25)}/notes.txt`,
    ]) {
      expect((await page.request.get(evil, { maxRedirects: 0 })).status(), evil).not.toBe(200);
    }

    // Signed out entirely.
    const anon = await browser.newContext();
    expect((await anon.request.get(mine, { maxRedirects: 0 })).status()).not.toBe(200);
    await anon.close();
  });

  test("ai status: the app says when the AI is not working, without being asked", async () => {
    await page.goto("/");
    const banner = page.locator('[data-testid="ai-status-banner"]');

    // The suite runs without an API key, so the app has to volunteer that —
    // the whole point is that a dead AI is never silent. It must name the
    // variable and say what to do, not just "AI unavailable".
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/No AI key reached the app/);

    // The suite deliberately runs one unsafe path and one safe one: the test
    // database sits in the repo (a deploy would wipe it) while UPLOAD_DIR is
    // outside it. Exactly one warning proves the check catches the real risk
    // without crying wolf about the correct setting — and these are the
    // loudest messages in the app, so a false alarm would teach you to ignore
    // the true one.
    const dataLoss = page.locator('[data-testid="deployment-warning"]');
    await expect(dataLoss).toHaveCount(1);
    await expect(dataLoss).toContainText(/database is stored inside the app directory/);
    await expect(dataLoss).toContainText(/DATABASE_URL/);
    await expect(dataLoss).not.toContainText(/Uploaded photos/);
    await expect(banner).toContainText(/ANTHROPIC_API_KEY/);
    await expect(banner.getByRole("link", { name: /Settings/ })).toBeVisible();

    // And it follows you around, rather than living on one page you must find.
    for (const url of ["/school", "/gym", "/football", "/coach"]) {
      await page.goto(url);
      await expect(page.locator('[data-testid="ai-status-banner"]')).toBeVisible();
    }
  });

  test("settings: the microphone check separates the four ways voice can fail", async () => {
    await page.goto("/settings");
    const card = page.locator("div.rounded-2xl").filter({ has: page.getByRole("heading", { name: "Microphone" }) });
    await expect(card).toBeVisible();

    const rows = card.locator("li");
    await expect(rows).toHaveCount(4);

    // Each is a separate cause with a separate fix, which is the point: a
    // silent microphone otherwise tells you nothing about which one you have.
    await expect(rows.nth(0)).toContainText(/speech recognition/i);
    await expect(rows.nth(1)).toContainText(/secure connection/i);
    await expect(rows.nth(2)).toContainText(/permission/i);
    await expect(rows.nth(3)).toContainText(/hears you/i);

    // The last one is the only proof that counts, and it says so.
    await expect(rows.nth(3)).toContainText(/the one that matters/i);

    // Pressing it must reach a verdict rather than sitting untested — CI has
    // no audio device, so the verdict here is a refusal, which is still a
    // verdict.
    const button = card.getByRole("button", { name: /Test my microphone/ });
    if (await button.isEnabled()) {
      await button.click();
      await expect(rows.nth(2)).not.toContainText(/Not tested yet/, { timeout: 15000 });
    }
  });

  test("settings: the backup contains this account's data and photos, and nobody else's", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    // A real photo first, so the archive has something to carry — and one over
    // a megabyte, because the progress-photo form is a plain Server Action
    // post and that is where the 1MB body limit used to reject it. A 1x1 PNG
    // here proved the backup worked for a photo nobody could have uploaded.
    const png = makeNoisyPng(700, 700);
    expect(png.byteLength, "the test photo must exceed the old 1MB limit").toBeGreaterThan(1024 * 1024);
    await page.goto("/gym/history");
    await page.setInputFiles('input[name="photo"]', { name: "progress.png", mimeType: "image/png", buffer: png });
    await page.fill('input[name="caption"]', "Backup test photo");
    await page.getByRole("button", { name: "Add photo" }).click();
    await expect(page.getByText("Backup test photo")).toBeVisible();

    // Before the first download the app says so plainly, rather than showing a
    // date that would suggest a safety net nobody has actually made.
    await page.goto("/settings");
    await expect(page.getByTestId("backup-age")).toContainText(/never/i);

    const download = await page.request.get("/api/export");
    expect(download.status()).toBe(200);
    expect(download.headers()["content-disposition"]).toContain("momentum-backup-");
    expect(Number(download.headers()["x-momentum-photos"])).toBeGreaterThanOrEqual(1);
    // A photo the data points at but that isn't on disk is the failure mode
    // this header exists to make visible — here everything must be found.
    expect(download.headers()["x-momentum-missing-photos"]).toBe("0");

    const archive = await download.body();
    const dir = mkdtempSync(path.join(tmpdir(), "momentum-e2e-backup-"));
    const file = path.join(dir, "backup.tar.gz");
    writeFileSync(file, archive);
    // The system's own tar, not a library that agrees with the writer.
    execFileSync("tar", ["-xzf", file, "-C", dir]);

    const root = readdirSync(dir).find((entry) => entry.startsWith("momentum-backup-"))!;
    expect(root, "the archive has a dated folder").toBeTruthy();
    const contents = readdirSync(path.join(dir, root));
    expect(contents).toContain("data.json");
    expect(contents).toContain("README.txt");
    expect(readdirSync(path.join(dir, root, "photos")).length).toBeGreaterThanOrEqual(1);

    const data = JSON.parse(readFileSync(path.join(dir, root, "data.json"), "utf8"));
    expect(data.email).toBe(email);
    expect(data.subjects.length).toBeGreaterThan(0);

    // The school-AI conversation and the drill videos are newer tables, and a
    // table that isn't in the backup query is missing without any symptom
    // until someone restores. Its photos live in a JSON column rather than an
    // imagePath field, so they have to be collected by a separate rule — and
    // the two files really are in the archive, not just named in the data.
    const question = data.schoolAIMessages.find((m: { content: string }) => m.content.startsWith("Mark my working"));
    expect(question, "the school AI conversation is in the backup").toBeTruthy();
    const questionPhotos: string[] = JSON.parse(question.imagePaths);
    expect(questionPhotos).toHaveLength(2);
    const archivedPhotos = readdirSync(path.join(dir, root, "photos"));
    for (const photo of questionPhotos) {
      expect(archivedPhotos, photo).toContain(photo.split("/").pop());
    }
    expect(data.drillVideos.some((v: { skill: string }) => v.skill === "Agility")).toBe(true);
    // Credentials are not data, and a backup you might email yourself must not
    // carry them.
    expect(data.passwordHash).toBeUndefined();
    expect(data.accounts).toBeUndefined();
    expect(data.sessions).toBeUndefined();

    // And afterwards it knows when. The date comes from handing over a real
    // archive, not from clicking the button.
    await page.goto("/settings");
    await expect(page.getByTestId("backup-age")).toContainText("Last backup: today");

    // Somebody else's account gets their own backup, not this one's.
    const otherEmail = `e2e_backup_${Date.now()}@example.com`;
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("/register");
    await otherPage.fill('input[name="name"]', "Other Person");
    await otherPage.fill('input[name="email"]', otherEmail);
    await otherPage.fill('input[name="password"]', password);
    await otherPage.fill('input[name="invite"]', E2E_INVITE_CODE);
    await otherPage.getByRole("button", { name: /create account/i }).click();
    await otherPage.waitForURL(/\/onboarding|\/$/);

    const theirs = await otherPage.request.get("/api/export");
    expect(theirs.status()).toBe(200);
    const theirFile = path.join(dir, "theirs.tar.gz");
    writeFileSync(theirFile, await theirs.body());
    const theirDir = mkdtempSync(path.join(tmpdir(), "momentum-e2e-backup-other-"));
    execFileSync("tar", ["-xzf", theirFile, "-C", theirDir]);
    const theirRoot = readdirSync(theirDir).find((entry) => entry.startsWith("momentum-backup-"))!;
    const theirData = JSON.parse(readFileSync(path.join(theirDir, theirRoot, "data.json"), "utf8"));

    expect(theirData.email).toBe(otherEmail);
    expect(JSON.stringify(theirData)).not.toContain(email);
    expect(theirData.bodyPhotos).toEqual([]);

    // Signed out, it hands over nothing at all.
    const anon = await browser.newContext();
    expect((await anon.request.get("/api/export", { maxRedirects: 0 })).status()).not.toBe(200);
    await anon.close();
    await other.close();
  });

  test("settings: a backup restores into a fresh account, photo and all", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    // Writing a whole account's rows one by one takes longer than a click.
    test.setTimeout(120_000);
    // The disaster this exists for: the app is gone, you install it again, and
    // all you have is the file. So the restore goes into a brand new account,
    // not the one it came from.
    const backup = await page.request.get("/api/export");
    expect(backup.status()).toBe(200);
    const archive = await backup.body();

    const freshEmail = `e2e_restore_${Date.now()}@example.com`;
    const fresh = await browser.newContext();
    const freshPage = await fresh.newPage();
    await freshPage.goto("/register");
    await freshPage.fill('input[name="name"]', "Fresh Install");
    await freshPage.fill('input[name="email"]', freshEmail);
    await freshPage.fill('input[name="password"]', password);
    await freshPage.fill('input[name="invite"]', E2E_INVITE_CODE);
    await freshPage.getByRole("button", { name: /create account/i }).click();
    await freshPage.waitForURL("**/onboarding");

    // A brand new account is held on this screen until it is set up, so the
    // restore has to be reachable from here — otherwise the one case a backup
    // exists for means setting everything up by hand first.
    await expect(freshPage.getByText("Already have a backup?")).toBeVisible();

    const dir = mkdtempSync(path.join(tmpdir(), "momentum-e2e-restore-"));
    const file = path.join(dir, "momentum-backup.tar.gz");
    writeFileSync(file, archive);

    await freshPage.getByText("Already have a backup?").click();
    await freshPage.setInputFiles('input[type="file"][accept*="gzip"]', file);
    await freshPage.getByTestId("restore-confirm").check();
    const restored = freshPage.waitForResponse((response) => response.url().includes("/api/restore"));
    await freshPage.getByRole("button", { name: "Restore this backup" }).click();

    // The response is the authoritative account of what happened. The panel's
    // own summary is not asserted here on purpose: a restore onto a set-up
    // account makes onboarding let it through, so the page navigates home and
    // the message goes with it.
    const response = await restored;
    expect(response.status(), "the restore request itself").toBe(200);
    const payload = await response.json();
    expect(payload.error ?? null, "the restore reported an error").toBeNull();
    expect(payload.rows, "rows restored").toBeGreaterThan(0);
    expect(payload.photos, "photos restored").toBeGreaterThanOrEqual(1);
    expect(payload.ignored, "files in the archive that were not part of a backup").toEqual([]);

    // Set up now, so the screen that held this account hostage lets it past.
    await freshPage.waitForURL("/", { timeout: 30_000 });

    // The data arrived...
    await freshPage.goto("/school");
    await expect(chemistryCard(freshPage)).toBeVisible();
    // ...including the topic under it, which means the parent link survived
    // being written under a new id.
    await chemistryCard(freshPage).click();
    await expect(freshPage.getByRole("cell", { name: /Periodic Table/ })).toBeVisible();
    // The restored account is set up, so onboarding lets it through now.
    await freshPage.goto("/onboarding");
    await freshPage.waitForURL("/");

    // The timetable too — both halves of it. The lesson proves the link to its
    // subject was rewritten; the break proves a slot with no subject at all
    // made it into the backup, which is most of a real week.
    await freshPage.goto("/school/timetable");
    await expect(freshPage.locator('input[value="Chemistry"]')).toBeVisible();
    await expect(freshPage.locator('input[value="Morning break"]')).toBeVisible();

    // The league link too. It is a table the backup scanner only started
    // covering when it was added, and a link that silently did not come back
    // would be a page you can no longer reach from the app.
    await freshPage.goto("/football");
    await expect(freshPage.getByTestId("league-links").getByRole("link", { name: /Fixtures/ })).toBeVisible();

    // The photo came back as a file, not just as a row: this is a real
    // request through the serving route, which only answers for the owner.
    await freshPage.goto("/gym/history");
    await expect(freshPage.getByText("Backup test photo")).toBeVisible();
    const img = freshPage.locator('img[src^="/uploads/"]').first();
    await expect(img).toBeVisible();
    const src = await img.getAttribute("src");
    expect((await freshPage.request.get(src!)).status()).toBe(200);

    // The school-AI question comes back with both its photos, under this
    // account's own paths. Its photo paths live in a JSON column, so they need
    // rewriting as a list — get that wrong and the question restores pointing
    // at the exporting account's folder, where this one is refused and every
    // picture renders broken.
    await freshPage.goto("/school");
    await expect(freshPage.getByText(/Mark my working on this/)).toBeVisible();
    const restoredPhotos = freshPage.getByAltText("Photo sent to your school AI");
    await expect(restoredPhotos).toHaveCount(2);
    for (const restoredSrc of await restoredPhotos.evaluateAll((imgs) => imgs.map((i) => i.getAttribute("src") ?? ""))) {
      expect(restoredSrc, restoredSrc).toContain("/uploads/");
      expect((await freshPage.request.get(restoredSrc)).status(), restoredSrc).toBe(200);
    }

    // And the drill video saved for Agility is back on the skill it belongs to.
    await freshPage.goto("/football");
    await freshPage.getByTestId("drill-library").getByRole("button", { name: "Agility", exact: true }).click();
    await expect(freshPage.getByTestId("drill-saved").getByText("Coach's ladder drill")).toBeVisible();

    // Restoring the same file again replaces rather than piles up: this is the
    // "I wasn't sure it worked, let me do it again" case, and it must not end
    // with two of everything.
    //
    // Counted through the account's own export rather than by looking at the
    // page: a duplicated timetable slot is invisible in the editor, which
    // groups the week by period, and invisible in a count of subjects. The row
    // count is the one place every doubled row shows up.
    const afterFirst = await freshPage.request.get("/api/export");
    const rowsAfterFirst = Number(afterFirst.headers()["x-momentum-rows"]);
    expect(rowsAfterFirst).toBeGreaterThan(0);

    await freshPage.goto("/onboarding");
    await freshPage.waitForURL("/");
    await freshPage.goto("/settings");
    await freshPage.setInputFiles('input[type="file"][accept*="gzip"]', file);
    await freshPage.getByTestId("restore-confirm").check();
    const again = freshPage.waitForResponse((response) => response.url().includes("/api/restore"));
    await freshPage.getByRole("button", { name: "Restore this backup" }).click();
    expect((await again).status()).toBe(200);
    await expect(freshPage.getByTestId("restore-result")).toBeVisible();

    await freshPage.goto("/school");
    await expect(chemistryCard(freshPage)).toHaveCount(1);

    const afterSecond = await freshPage.request.get("/api/export");
    expect(Number(afterSecond.headers()["x-momentum-rows"]), "rows after restoring the same file twice").toBe(
      rowsAfterFirst
    );

    // Restoring data is not becoming that person: the account is still theirs.
    await freshPage.goto("/settings");
    await expect(freshPage.getByText(freshEmail)).toBeVisible();

    // And the photo restored under this account is still private to it.
    const outsider = await browser.newContext();
    expect((await outsider.request.get(src!, { maxRedirects: 0 })).status()).not.toBe(200);
    await outsider.close();
    await fresh.close();
  });

  test("settings: a restore that fails partway leaves the account exactly as it was", async () => {
    // The dangerous shape of failure: the account is emptied, then something in
    // the file is refused, and the user is left with neither version. A backup
    // written by a newer build of the app is the realistic way in — here, a
    // column this build has never heard of.
    const dir = mkdtempSync(path.join(tmpdir(), "momentum-e2e-halfway-"));
    const file = path.join(dir, "from-the-future.tar.gz");
    writeFileSync(
      file,
      createTarGz([
        {
          name: "momentum-backup-2099-01-01/data.json",
          body: Buffer.from(
            JSON.stringify({
              id: "someone",
              email: "someone@example.com",
              subjects: [{ id: "s1", name: "Should never appear", columnFromTheFuture: true }],
            }),
            "utf8"
          ),
        },
      ])
    );

    await page.goto("/settings");
    await page.setInputFiles('input[type="file"][accept*="gzip"]', file);
    await page.getByTestId("restore-confirm").check();
    await page.getByRole("button", { name: "Restore this backup" }).click();
    await expect(page.getByTestId("restore-error")).toBeVisible();

    // Nothing of the file landed...
    await page.goto("/school");
    await expect(page.getByRole("link", { name: /Should never appear/ })).toHaveCount(0);
    // ...and nothing of this account was lost on the way to finding that out.
    await expect(chemistryCard(page)).toBeVisible();
    await page.goto("/school/timetable");
    await expect(page.locator('input[value="Chemistry"]')).toBeVisible();
  });

  test("settings: a file that is not a backup is refused with a reason", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "momentum-e2e-junk-"));
    const junk = path.join(dir, "holiday-photo.gz");
    writeFileSync(junk, Buffer.from("this is not an archive at all", "utf8"));

    await page.goto("/settings");
    await page.setInputFiles('input[type="file"][accept*="gzip"]', junk);
    await page.getByTestId("restore-confirm").check();
    await page.getByRole("button", { name: "Restore this backup" }).click();

    await expect(page.getByTestId("restore-error")).toBeVisible();
    // And it said so without touching anything.
    await page.goto("/school");
    await expect(chemistryCard(page)).toBeVisible();
  });

  test("settings: one card says whether this deployment will keep your data", async () => {
    await page.goto("/settings");
    const card = page.getByTestId("setup-checks");
    await expect(card).toBeVisible();

    // The schema row. This server starts from `prisma db push`, so it passes —
    // and that is the point: the row exists and reports, rather than only
    // appearing once something is already broken. The deployment that lost the
    // league-links table had no signal at all until a feature failed.
    await expect(card.getByTestId("check-schema")).toContainText(/every table and column/i);

    // This server runs with an invite code set, so the row says the door is
    // shut — and it must not print the code, because every invited guest can
    // open this page and would otherwise be able to invite the next one.
    const signup = page.getByTestId("check-signup");
    await expect(signup).toContainText(/invite code/i);
    await expect(signup.locator("xpath=..")).not.toContainText(E2E_INVITE_CODE);

    // The suite runs a production build with UPLOAD_DIR outside the repo and
    // the test database inside it — one safe path and one unsafe one, on
    // purpose, so both halves of the check are exercised in the same run.
    await expect(page.getByTestId("check-photo-storage")).toContainText(/outside the app directory/);
    await expect(page.getByTestId("check-database")).toContainText(/deploy/);

    // A photo was uploaded earlier in this run, and its file is really there.
    await expect(page.getByTestId("check-photo-files")).toContainText(/where the app expects/);

    // No AI key in CI, so it says which key is missing rather than "error".
    await expect(page.getByTestId("check-ai")).toContainText(/key/i);

    // A backup was downloaded earlier in this run, so this one is satisfied.
    await expect(page.getByTestId("check-backup")).toContainText(/Last backup/);

    // The test server has no TZ set, like a fresh Render deployment, so this
    // row says what a UTC clock does to every date in the app rather than
    // reporting a zone name and leaving the reader to work it out.
    const timezone = page.getByTestId("check-timezone");
    await expect(timezone).toContainText(/UTC/);
    await expect(timezone).toContainText(/Today/);
    // The fix is its own line in the card, so it is asserted on the row, not
    // on the detail paragraph.
    await expect(timezone.locator("xpath=..")).toContainText(/TZ=Europe\/Zurich/);

    // The headline leads with the worst row, and says it in words.
    await expect(card).toContainText(/needs fixing now|worth fixing|checks out/);
  });

  test("offline: the installed app says the signal is gone, and keeps nothing personal to say it", async () => {
    // Installed to a home screen, this app is one dropped signal away from
    // looking broken. The service worker's whole job is to make that moment
    // read as the app speaking rather than as the browser giving up.
    await page.goto("/");
    // serviceWorker.ready resolves as soon as there IS an active worker, which
    // is while it is still "activating" — and this one's activate handler does
    // several async cache operations. So wait for the state itself.
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const worker = reg.active;
      if (!worker) return null;
      if (worker.state === "activated") return worker.state;
      await new Promise<void>((resolve) => {
        worker.addEventListener("statechange", () => {
          if (worker.state === "activated") resolve();
        });
      });
      return worker.state;
    });
    expect(state, "a service worker is registered and running").toBe("activated");

    // Visit pages full of personal data, so that anything the worker was going
    // to keep, it has now had every chance to keep.
    await page.goto("/school");
    await page.goto("/gym/history");
    await page.goto("/settings");

    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const urls: string[] = [];
      for (const name of names) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) urls.push(new URL(request.url).pathname);
      }
      return urls;
    });

    // The cache outlives signing out, and on a shared or borrowed phone that
    // is the whole risk. Build files and the offline page only.
    const personal = cached.filter(
      (url) => !url.startsWith("/_next/static/") && !["/offline", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"].includes(url)
    );
    expect(personal, "pages or photos left in the offline cache").toEqual([]);
    expect(cached).toContain("/offline");

    // The pill under the app's name says which side of the line you are on,
    // so it has to actually follow the connection rather than being a badge.
    await expect(page.getByTestId("connection-pill")).toContainText("Online");

    // Now pull the plug.
    await page.context().setOffline(true);
    try {
      await expect(page.getByTestId("connection-pill")).toContainText("Offline");
      await page.goto("/school");
      await expect(page.getByRole("heading", { name: /You're offline/ })).toBeVisible();
      await expect(page.getByText(/needs a connection/)).toBeVisible();
      // It says the app is fine, not that the data is gone.
      await expect(page.getByText(/Nothing has been lost/)).toBeVisible();
    } finally {
      await page.context().setOffline(false);
    }

    // And back online it is the real app again, not a cached shell.
    await page.goto("/school");
    await expect(chemistryCard(page)).toBeVisible();
  });

  test("offline: a phone that has only ever opened the app once still gets the offline page", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    // The case the precache is for. A fresh install, one visit — the login
    // screen, before anyone has signed in — and then no signal. Whatever the
    // offline page needs has to have been stored during that one visit, not
    // collected while browsing around.
    const fresh = await browser.newContext();
    const freshPage = await fresh.newPage();
    await freshPage.goto("/login");
    await freshPage.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const worker = reg.active;
      if (!worker || worker.state === "activated") return;
      await new Promise<void>((resolve) => {
        worker.addEventListener("statechange", () => {
          if (worker.state === "activated") resolve();
        });
      });
    });

    const failed: string[] = [];
    freshPage.on("requestfailed", (request) => failed.push(new URL(request.url()).pathname));

    await fresh.setOffline(true);
    try {
      await freshPage.goto("/");
      await expect(freshPage.getByRole("heading", { name: /You're offline/ })).toBeVisible();
      // Styled and complete: nothing the page itself asked for was missing.
      expect(
        failed.filter((pathname) => pathname.startsWith("/_next/static/")),
        "build files the offline page needed were not in the cache"
      ).toEqual([]);
    } finally {
      await fresh.setOffline(false);
      await fresh.close();
    }
  });

  test("settings: toggle theme and sign out", async () => {
    await page.goto("/settings");
    await expect(page.getByText(email)).toBeVisible();

    await page.click('button[aria-label="Sign out"]');
    await page.waitForURL("**/login");
  });
});
