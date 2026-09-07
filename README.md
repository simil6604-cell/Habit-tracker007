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
  medical advice, ever. Set `ANTHROPIC_API_KEY` to wire in a real LLM later
  without changing any calling code.
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
  summaries), baseline "where do you stand" self-assessments for School/Gym/
  Football that feed the score engine until real activity data exists,
  workout plans/logging/history with charts, football profile/training/
  matches, manual league table entry with analysis, the AI Coach's
  balance/workload engine and chat, calendar (day/week/month), tasks,
  analytics, and settings.
- **Explicitly interface-only (per the brief)**: official Cambridge syllabus
  content and official league/federation data are never fabricated. Both
  areas have clean data models and manual-entry UI (`MANUAL DATA MODE`)
  ready for a real Cambridge document import or league API to be wired in.
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
