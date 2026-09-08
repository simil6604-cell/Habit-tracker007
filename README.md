# Optimize — School, Gym & Football

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
  no other code changes needed. When it's on, the School AI Learning
  Assistant (the free-text "Ask" box and "Explain this topic"/"Log
  mistake") gets genuine subject tutoring framed for your Cambridge
  IGCSE/AS/A-Level level (see `src/lib/ai/academic-prompt.ts`), and the AI
  Coach chat gets real open-ended replies for anything its keyword shortcuts
  don't already handle. Any real-AI call failure (bad key, network, rate
  limit) falls back to the same honest rule-based response instead of
  crashing or faking an answer.
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
  topic progress, homework, exams, flashcards with spaced repetition, the
  study planner, a daily School checklist that suggests a concrete time
  (a free/Study period today, or after training) for anything not done yet,
  a rule-based AI Learning Assistant per topic (explain the approach, an
  exam-relevance checklist, logging what went wrong, subject-wide weakness
  summaries), a habit-tracker grid for your own recurring school habits
  (fully custom rows, a 4-week checkbox grid with per-habit success rates
  and a daily-completion trend chart), baseline "where do you stand"
  self-assessments for School/Gym/Football that feed the score engine
  until real activity data exists,
  workout plans/logging/history with charts, an exercise library with form
  cues and your own saved reference videos, a rough MET-based calorie-burn
  estimate per session plus a daily calories-in-vs-out balance card, meal
  logging with a common-foods autofill for calories and protein (always
  approximate, never a diet push), a daily protein progress bar against your
  own goal (150g by default), a Monday–Friday lunch/dinner meal plan built
  from real, widely-published food combos that balances protein and
  calories evenly across the week (with a regenerate option), training
  diaries with rule-based tips ("what went well / to
  improve") for both gym and football, football profile/training/matches
  with a drill library (cues + saved videos) and diary, manual league table
  entry with analysis (points gap, a labeled best-case "path to 1st"
  scenario, next-match callout), body-weight logging against a self-set
  target weight with a progress chart, calories-burned and training-focus
  charts, body progress photos (upload, gallery/timeline, oldest-vs-newest
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
