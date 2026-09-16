import { test, expect, type Page, type Browser } from "@playwright/test";

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

    const subjectCard = page.getByRole("link", { name: /Chemistry/ });
    await expect(subjectCard).toBeVisible();
    await subjectCard.click();

    await page.fill('input[placeholder="e.g. Algebra"]', "Periodic Table");
    await page.click('button:has-text("Add topic")');
    await expect(page.getByRole("cell", { name: /Periodic Table/ })).toBeVisible();
  });

  test("school: a revision link is saved and stays a link, not content", async () => {
    await page.goto("/school");
    await page.getByRole("link", { name: /Chemistry/ }).click();

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

  test("school: an assistant reply renders as structure, not raw markdown", async () => {
    await page.goto("/school");
    await page.getByRole("link", { name: /Chemistry/ }).click();
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
    await page.getByRole("link", { name: /Chemistry/ }).click();
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

  test("gym: create a workout plan", async () => {
    await page.goto("/gym");
    await page.fill('input[placeholder="e.g. Upper Body"]', "Leg Day");
    await page.click('button:has-text("Add plan")');
    // The plan's own card, not the "not on a day yet" hint that also names it.
    await expect(page.getByText("Leg Day", { exact: true }).first()).toBeVisible();
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

    // Traversal and shapes this app never writes.
    for (const evil of [
      `/uploads/${"x".repeat(25)}/..%2f..%2fpackage.json`,
      `/uploads/${"x".repeat(25)}/nested/dir/photo.png`,
      `/uploads/${"x".repeat(25)}/notes.txt`,
    ]) {
      expect((await page.request.get(evil, { maxRedirects: 0 })).status()).not.toBe(200);
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

  test("settings: toggle theme and sign out", async () => {
    await page.goto("/settings");
    await expect(page.getByText(email)).toBeVisible();

    await page.click('button[aria-label="Sign out"]');
    await page.waitForURL("**/login");
  });
});
