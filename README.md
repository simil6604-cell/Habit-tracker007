# Momentum — School, Gym & Football

[![CI](https://github.com/simil6604-cell/Habit-tracker007/actions/workflows/ci.yml/badge.svg)](https://github.com/simil6604-cell/Habit-tracker007/actions/workflows/ci.yml)

An all-in-one personal optimization app that connects three areas of life —
🎓 **School**, 🏋️ **Gym**, and ⚽ **Football** — behind a single AI Coach that
balances all of them together.

## Tech stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS 4**
- **Prisma** + **SQLite** in development (swap the datasource provider to
  `postgresql` and set `DATABASE_URL` for production — the schema is
  Postgres-ready as-is)
- **NextAuth v5** (credentials auth, single-user personal accounts)
- **Recharts** for progress charts
- A pluggable **AI provider interface** (`src/lib/ai/provider.ts`): ships
  with a fully offline, rule-based `MockAIProvider` that reasons only over
  your own stored data — no invented syllabus content, league results, or
  medical advice, ever. Set `ANTHROPIC_API_KEY` to switch to a real
  Claude-backed `AnthropicProvider` (`src/lib/ai/anthropic-provider.ts`) —
  no other code changes needed. When it's on, the School AI Tutor becomes a
  genuine persistent, back-and-forth conversation per topic — not one-shot
  Q&A — that remembers what you've already discussed, framed for your
  Cambridge IGCSE/AS/A-Level level (see `src/lib/ai/academic-prompt.ts`),
  and draws a labeled diagram (a sanitized, AI-generated SVG — shapes,
  graphs, number lines) inline whenever one would genuinely help, and the AI
  Coach chat gets real open-ended replies for anything its keyword shortcuts
  don't already handle. Without a connected AI, the tutor chat says so
  honestly instead of faking a conversation. Any real-AI call failure (bad
  key, network, rate limit) falls back to the same honest response instead
  of crashing or faking an answer.
- PWA-ready (`manifest.json`, icons, "Add to Home Screen" on iOS/Android)

## Getting started

```bash
npm install
cp .env.example .env        # adjust AUTH_SECRET for anything beyond local dev
npm run db:push             # creates prisma/dev.db from the schema
npm run db:seed             # optional: demo@optimize.app / password123
npm run dev
```

Open http://localhost:3000, register an account, and walk through onboarding.

## Testing

A Playwright end-to-end test walks through the entire app on a disposable
SQLite database (`prisma/test.db`, separate from your real `dev.db`): it
registers an account, completes onboarding, then exercises School, Gym,
Football, the AI Coach, Calendar, Tasks and Settings against a real running
server.

```bash
npm run test:e2e
```

See `tests/e2e/smoke.spec.ts` and `playwright.config.ts`.

## What's real vs. mock

- **Real, working, and persisted**: authentication, a real-school-shaped
  timetable (named periods, registration/lessons/breaks/study/clubs, a bulk
  grid editor, and a diagram view that highlights exam subjects), subjects &
  topic progress, homework, exams, flashcards with spaced repetition plus a
  per-subject Quiz page (a flashcard carousel filtered to that subject, due
  or full-deck practice mode, and a 6-question exam-style quiz spanning the
  subject's topics — click "🧠 Quiz" on any subject card), the
  study planner, a daily School checklist that suggests a concrete time
  (a free/Study period today, or after training) for anything not done yet,
  an AI Tutor per topic — a real persistent, multi-turn conversation (not
  one-shot Q&A) that remembers earlier turns, answers follow-ups in
  context, and draws a sanitized AI-generated SVG diagram inline when one
  genuinely helps explain something, with quick-start prompts ("Explain
  this topic" / "What do I need for the exam?"), free-text chat, and a
  clear-conversation option — plus logging what went wrong and subject-wide
  weakness summaries, with a per-topic learning log (what you understand, what you
  don't, and open questions — persisted, editable) and an end-of-session
  quiz that targets those logged gaps and gives real AI-graded feedback
  when a real AI is connected, a per-topic note-photo box (take or upload as
  many photos of your notes/papers as you like in one go — no cap, with live
  "adding N of M" progress on a big batch — each stored as-is and
  transcribed/summarized individually by a real AI when one's connected,
  illegible handwriting called out rather than guessed) and a class recorder (live speech-to-text via the browser's own
  engine where supported, or type/paste as a fallback, then a real AI
  summary plus a quiz built only from what the transcript actually covers),
  a habit-tracker grid for your own recurring school habits
  (fully custom rows, a 4-week checkbox grid with per-habit success rates
  and a daily-completion trend chart), baseline "where do you stand"
  self-assessments for School/Gym/Football that feed the score engine
  until real activity data exists, an "AI Coach — before you dive in" banner
  at the top of the home page that picks the single most important thing to
  know today (an exam, a match, homework due, a scheduled session) by
  reasoning only over your own real agenda data — never a generic tip,
  workout plans/logging/history with charts, an exercise library with form
  cues and your own saved reference videos, a rough MET-based calorie-burn
  estimate per session plus a daily calories-in-vs-out balance card with a
  semi-circular "kcal left" gauge and carb/protein/fat progress bars against
  your own goals, meal logging grouped by type (Breakfast/Lunch/Dinner/
  Snacks, each with a ring-icon progress indicator) with a common-foods
  autofill for calories, protein, carbs and fat (always approximate, never a
  diet push — per-type targets are just a common rule-of-thumb 30/40/25/5%
  split of your own daily goal, not measured or prescribed), a tap-to-log
  water tracker (250ml glasses against your own daily goal, tap a filled
  glass to undo — deliberately doesn't guess how much water your food
  contained, since that would need a food-composition database this app
  doesn't have), a daily protein progress bar against your
  own goal (150g by default), a Monday–Friday lunch/dinner meal plan built
  from real, widely-published food combos that balances protein and
  calories evenly across the week (with a regenerate option), training
  diaries with rule-based tips ("what went well / to
  improve") for both gym and football, football profile/training/matches
  with a browsable Drill Library (all 16 skills, each with a coaching cue
  and one real, verified example YouTube video — a starting point, never a
  replacement for a coach) plus saved videos and diary, a league table you
  can either enter manually or sync by pasting your league's own table page
  URL (fetches the real page and has the connected AI read off the actual
  standings — never invented; falls back to manual entry if the page can't
  be reached or read) with analysis (points gap, a labeled best-case
  "path to 1st" scenario, next-match callout), body-weight logging against a self-set
  target weight with a progress chart, calories-burned and training-focus
  charts, a weekly time-split donut chart on Analytics (School vs Gym vs
  Football, built from completed study sessions/workouts/trainings actually
  logged that week, not a target), body progress photos (upload, gallery/timeline, oldest-vs-newest
  or pick-your-own before/after compare view) and optional photos attached
  to meal log entries, a barcode product scanner (camera or manual entry)
  that looks products up against Open Food Facts — a real, free product
  database — and shows a transparent 0–100 health score built from
  Nutri-Score, processing level (NOVA) and additive count, the AI Coach's
  balance/workload engine and chat, calendar (day/week/month), tasks,
  analytics, and settings.
- **Explicitly interface-only (per the brief)**: official Cambridge syllabus
  content and official league/federation data are never fabricated. Both
  areas have clean data models and manual-entry UI (`MANUAL DATA MODE`)
  ready for a real Cambridge document import or league API to be wired in.
- **Deliberately not faked**: there's no real photo-based food/calorie
  recognition and no real video motion analysis anywhere in the app — both
  need a genuine multimodal AI provider. Food entries and calorie values are
  always user-entered (with optional common-food autofill); exercise/drill
  videos are links you paste and save yourself, never invented or fetched.
  Body and meal photos are stored exactly as uploaded and shown back to you
  as a visual log — nothing analyzes, scores, or draws conclusions from them.
  The product scanner's health score is this app's own transparent formula
  (see `src/lib/gym/health-score.ts`) — not a reproduction of Yuka's or any
  other app's proprietary algorithm, since those aren't published. It only
  ever uses real fields Open Food Facts actually has for a product; a
  missing field gets a neutral default rather than an invented value, and
  the score's full breakdown is always shown alongside the number. The
  scanner needs outbound internet access to reach `openfoodfacts.org`; a
  locked-down network (e.g. a restrictive dev sandbox) will surface a clear
  "couldn't reach the product database" message instead of failing silently.
  The topic quiz never invents questions, answers, or grading — without a
  real AI connected it says so plainly instead of faking a quiz. Note-photo
  summaries use Claude's real vision input (an actual multimodal API call on
  the photo you took) — never OCR guesswork dressed up as AI, and never
  generated without one. The class recorder's live transcript comes only
  from the browser's own built-in speech-to-text (Chrome/Edge; typically
  needs that browser's own online speech service) or what you type/paste —
  never a fabricated transcript — and its summary/quiz are built strictly
  from that transcript's actual content.
- **AI Coach**: rule-based by default so the app works fully offline with
  zero API keys. It only ever reasons over what's actually in your
  database (real exams, real progress percentages, real training times) —
  see `src/lib/ai/`.

## Project structure

```
prisma/schema.prisma        All data models
src/app/(auth)/...          Login / register
src/app/onboarding/         First-run setup wizard
src/app/(app)/...           Authenticated app shell: home, school, gym,
                             football, coach, calendar, tasks, analytics,
                             settings
src/components/             UI primitives + per-domain components
src/lib/ai/                 Provider interface, chat engine, balance/
                             workload engine, study/training generators
src/lib/<domain>/actions.ts Server actions (CRUD) per domain
```

## Tests

```
npm test        # unit tests — the reasoning: league arithmetic, meal planning,
                # spaced repetition, the SVG sanitizer, the deployment check
npm run test:e2e  # end-to-end — the whole app in a real browser
```

The unit tests cover the code where a wrong answer is *confidently* wrong and
invisible to a browser test: a title race declared over, a day that misses its
protein goal, a flashcard scheduled for the wrong week, an exam countdown that
says "0 days" about tomorrow, markup that should never have been let through.
Several of them exist because that exact bug shipped once — they were each
checked by reintroducing the bug and confirming the test fails.

251 unit tests and 32 end-to-end tests at the time of writing. Both run on
every pull request and every push to `main` (`.github/workflows/ci.yml`), so
the badge at the top of this file is the current answer rather than the last
time someone remembered to run them.

## Safety

No medical diagnoses, no extreme diets, no unsafe training volume, no
unrealistic body ideals. The app nudges toward balance and recovery and
explicitly recommends talking to a parent, coach, or doctor for anything
health-related.

## Deploying (Render)

`render.yaml` in the repo root is the machine-readable version of everything
below, for creating the service from scratch. Applying it to a service that is
already running overwrites that service's settings, so if yours works, treat
the Blueprint as the rebuild recipe and change the live service in the
dashboard.

The app also checks this itself at runtime: if the database or the uploads
directory ends up somewhere a deploy will wipe, every page says so in red
before the data is lost, rather than after.

**Build Command**
```
npm install && npm run build
```

**Start Command**
```
npx prisma db push --skip-generate && npm run start
```
`prisma db push` belongs in the *start* command, not the build command: the
persistent disk is only mounted at runtime, so a build-time write fails with
`Read-only file system (os error 30)`. Having it here also means a schema
change applies itself on the next deploy.

**Disk** — mount at `/var/data`. Everything that must survive a deploy lives
there, because the app directory itself is rebuilt from git every time.

**Environment variables**

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | `file:/var/data/prod.db` | SQLite on the persistent disk. Anywhere else and every account, note and log is wiped on each deploy. |
| `UPLOAD_DIR` | `/var/data/uploads` | Note photos, meal photos and progress photos. Without this they are written into the app directory, and each deploy deletes them while the database rows still point at them — the photos turn into broken images with no error. |
| `ANTHROPIC_API_KEY` | your key | Enables the real AI. Without it the app falls back to its own rule-based logic and says so rather than inventing answers. Settings → **Test AI connection** reports what is actually wrong if it isn't working. |
| `AUTH_SECRET` | a long random string | Signs session cookies. |
| `NEXTAUTH_URL` / `AUTH_URL` | your app's URL | Auth redirects are built from this. |
| `TZ` | `Europe/Zurich` | The server counts days in its own time zone, and a container is UTC by default. Without this, anything logged between midnight and 02:00 is filed under the previous day and "today" on the dashboard is yesterday until the small hours pass. |

Uploaded photos are served by an authenticated route rather than as static
files, so a progress photo is not readable by anyone who happens to have the
link.

### After deploying, check one card

Settings opens with **"Is everything set up right?"** — five rows that answer
it: where photos are written, whether the photo files are still on disk, where
the database lives, whether the AI can answer, and how old the backup is. Each
row names a state and, when something is wrong, the exact change to make.

The photo row is the one worth reading twice. Database rows and image files can
disagree — a deploy that rebuilds the app directory deletes the photos while
every row still points at them, and nothing looks wrong until you open a
gallery of broken images. That row counts the stored paths and checks them
against the disk, so the answer arrives before the photos are missed.

## Your data is yours, and it can leave

**Settings → Download backup** produces one `.tar.gz`: `data.json` with every
row this account holds, `photos/` with every image the data refers to, and a
README naming what is inside. It carries no password and no session data — a
backup you might email yourself should not be a way into the account.

**Settings → Restore a backup** puts it back, and so does the onboarding screen
of a fresh install, which is where a new account is held until it is set up.
Restoring replaces what the account currently holds rather than merging: two
half-versions of the same diary, with no way to tell which half is right, is
worse than either. It runs as one transaction, so a file the app cannot read
leaves the account exactly as it was.

Settings also says how old the last backup is, and the home page asks for a
fresh one once there is a week of use behind it and no backup — not on day one,
because an app that nags from the first minute is furniture by the time the
warning means something.

## Offline

The app installs to a phone's home screen, and a service worker makes a dropped
signal read as the app saying so rather than as the browser giving up. It
caches the build's own files and one offline page that knows nothing — pages,
uploaded photos and every API route are never stored, because a cache outlives
the sign-out that was supposed to end the session.
