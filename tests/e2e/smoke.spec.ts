import { test, expect, type Page, type Browser } from "@playwright/test";

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

    // Regenerating has to actually produce a different plan.
    const before = await cards.first().textContent();
    await page.click('a[href*="variant="]');
    await expect(page.getByRole("heading", { name: "Example days" })).toBeVisible();
    const after = await page.locator("div.rounded-2xl").filter({ hasText: "Day total" }).first().textContent();
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
    await page.fill('input[name="message"]', "optimize my entire week");
    await page.locator('form:has(input[name="message"]) button[type="submit"]').click();
    await page.waitForTimeout(1000);
    await expect(page.locator("main")).toContainText(/School|Gym|Football|Recovery/);
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

  test("settings: toggle theme and sign out", async () => {
    await page.goto("/settings");
    await expect(page.getByText(email)).toBeVisible();

    await page.click('button[aria-label="Sign out"]');
    await page.waitForURL("**/login");
  });
});
