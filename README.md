# Momentum — School, Gym & Football

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

## Safety

No medical diagnoses, no extreme diets, no unsafe training volume, no
unrealistic body ideals. The app nudges toward balance and recovery and
explicitly recommends talking to a parent, coach, or doctor for anything
health-related.
