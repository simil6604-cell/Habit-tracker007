import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";

/**
 * The run-up to one exam, day by day.
 *
 * Two things this is careful about, because both are ways a study plan becomes
 * a thing you ignore by Wednesday:
 *
 * It does not plan every remaining day. A plan with no gaps is one you break on
 * the first evening something comes up, and a broken plan gets abandoned rather
 * than adjusted. Longer run-ups get rest days on purpose.
 *
 * And the last day before the paper is never new material. Cramming something
 * for the first time the night before is how the things you did know get
 * crowded out.
 */

export type PlanDay = { date: Date; focus: string; detail?: string; minutes: number };

/** Below this, every remaining day is needed; above it, the plan can afford to breathe. */
const REST_DAY_THRESHOLD = 8;
/** Every Nth day off, once the run-up is long enough to have them. */
const REST_EVERY = 4;

export const MIN_MINUTES = 20;
export const MAX_MINUTES = 180;
export const MAX_PLAN_DAYS = 120;

/**
 * The days a plan should cover: today up to the day before the exam.
 *
 * Exam day itself is not a study day — whatever happens that morning, it is not
 * the plan's business.
 */
export function planDates(from: Date, examDate: Date, today: Date = new Date()): Date[] {
  const start = startOfDay(from < today ? today : from);
  const last = addDays(startOfDay(examDate), -1);
  const span = differenceInCalendarDays(last, start);
  if (span < 0) return [];

  const all = Array.from({ length: Math.min(span + 1, MAX_PLAN_DAYS) }, (_, i) => addDays(start, i));
  if (all.length < REST_DAY_THRESHOLD) return all;

  // Rest days counted back from the exam, so the last few days before the
  // paper are always working days however the run-up divides up.
  return all.filter((_, i) => (all.length - 1 - i) % REST_EVERY !== REST_EVERY - 1);
}

/** Minutes per day, rising as the exam gets closer. */
export function minutesFor(dayIndex: number, totalDays: number, base = 45): number {
  if (totalDays <= 1) return clampMinutes(base + 30);
  const share = dayIndex / (totalDays - 1);
  // The last week is worth more than the first, so the curve leans late
  // without ever asking for a whole evening on day one.
  return clampMinutes(Math.round((base + share * base) / 5) * 5);
}

export function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_MINUTES;
  return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(minutes)));
}

export type WeakTopic = { name: string; progressPct: number };

/**
 * A plan built from the student's own topics, without an AI.
 *
 * This is not a placeholder for when the key is missing — it is the honest
 * floor. It uses real topic names and real self-rated progress, weakest first,
 * and repeats the weakest ones rather than padding with invented material.
 */
export function fallbackPlan(dates: Date[], topics: WeakTopic[], subjectName: string): PlanDay[] {
  if (dates.length === 0) return [];

  const ordered = [...topics].sort((a, b) => a.progressPct - b.progressPct);
  const pool = ordered.length > 0 ? ordered : [{ name: `${subjectName} — whole syllabus`, progressPct: 0 }];

  return dates.map((date, i) => {
    const last = i === dates.length - 1;
    if (last) {
      return {
        date,
        focus: "Final review — no new material",
        detail: `Go back over ${pool.slice(0, 3).map((t) => t.name).join(", ")}. Past questions only, nothing you haven't seen.`,
        minutes: minutesFor(i, dates.length),
      };
    }
    const topic = pool[i % pool.length];
    return {
      date,
      focus: topic.name,
      detail:
        topic.progressPct > 0
          ? `You rate yourself ${topic.progressPct}% here. Revise it, then answer one exam question on it without notes.`
          : "Start from the concept, then a worked example, then one exam question without notes.",
      minutes: minutesFor(i, dates.length),
    };
  });
}

/** What the AI is asked to fill in, and what it is not allowed to change. */
export function planPrompt(
  subjectName: string,
  examTitle: string,
  examDate: Date,
  dates: Date[],
  topics: WeakTopic[],
  brief: string | null
): string {
  const topicLines = topics.length
    ? topics.map((t) => `- ${t.name} (self-rated ${t.progressPct}%)`).join("\n")
    : "- (the student hasn't broken this subject into topics yet)";

  return [
    `Build a day-by-day revision plan for one exam.`,
    ``,
    `Exam: ${examTitle}`,
    `Subject: ${subjectName}`,
    `Exam date: ${format(examDate, "EEEE d MMMM yyyy")}`,
    brief ? `In the student's own words: ${brief}` : "",
    ``,
    `Their topics, weakest first:`,
    topicLines,
    ``,
    `Plan exactly these ${dates.length} dates, in this order, and no others:`,
    dates.map((d) => format(d, "yyyy-MM-dd")).join(", "),
    ``,
    `Rules:`,
    `- Work from the topics listed above. Do not invent syllabus content that isn't there; if the list is empty, split the subject into sensible parts yourself and say so in the focus.`,
    `- Weakest topics get the most days, and come back a second time later in the run-up.`,
    `- The final date is review only — no new material.`,
    `- "minutes" is realistic for a school night: between ${MIN_MINUTES} and ${MAX_MINUTES}.`,
    ``,
    `Reply with JSON only, no prose, no code fence:`,
    `{"days":[{"date":"YYYY-MM-DD","focus":"short title","detail":"one or two sentences on what to actually do","minutes":45}]}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

type RawDay = { date?: unknown; focus?: unknown; detail?: unknown; minutes?: unknown };

/**
 * Reads the model's reply back into days, keeping only dates that were asked
 * for.
 *
 * A plan is a promise about specific days, so a reply that invents a date, or
 * skips one, must not quietly become the plan. Anything missing falls back to
 * the rule-based day for that date — the student gets a full run-up either way.
 */
export function parsePlan(reply: string, dates: Date[], fallback: PlanDay[]): PlanDay[] {
  const byDate = new Map(fallback.map((day) => [format(day.date, "yyyy-MM-dd"), day]));
  const wanted = dates.map((d) => format(d, "yyyy-MM-dd"));

  let parsed: { days?: unknown } | null = null;
  try {
    // Models add a fence even when told not to.
    const cleaned = reply.replace(/```(?:json)?/gi, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    parsed = start >= 0 && end > start ? JSON.parse(cleaned.slice(start, end + 1)) : null;
  } catch {
    parsed = null;
  }

  if (parsed && Array.isArray(parsed.days)) {
    for (const entry of parsed.days as RawDay[]) {
      if (!entry || typeof entry !== "object") continue;
      const key = typeof entry.date === "string" ? entry.date.trim() : "";
      if (!wanted.includes(key)) continue;
      const focus = typeof entry.focus === "string" ? entry.focus.trim() : "";
      if (!focus) continue;
      const existing = byDate.get(key);
      if (!existing) continue;
      byDate.set(key, {
        date: existing.date,
        focus: focus.slice(0, 120),
        detail: typeof entry.detail === "string" && entry.detail.trim() ? entry.detail.trim().slice(0, 400) : undefined,
        minutes: clampMinutes(typeof entry.minutes === "number" ? entry.minutes : existing.minutes),
      });
    }
  }

  return wanted.map((key) => byDate.get(key)!).filter(Boolean);
}

export type ReadingPoint = { dateKey: string; label: string; readiness: number | null; done: boolean | null };

/**
 * The plan as a line from the day it was made to the exam: how ready it felt,
 * and whether that day's work happened.
 *
 * Days with no reading stay null rather than zero. A day you didn't rate is not
 * a day you felt terrible, and a chart that says otherwise is the reason nobody
 * trusts the chart.
 */
export function readinessSeries(
  dates: Date[],
  checkIns: Map<string, number>,
  doneByDate: Map<string, boolean>
): ReadingPoint[] {
  return dates.map((date) => {
    const key = format(date, "yyyy-MM-dd");
    return {
      dateKey: key,
      label: format(date, "d MMM"),
      readiness: checkIns.get(key) ?? null,
      done: doneByDate.has(key) ? doneByDate.get(key)! : null,
    };
  });
}

/** Where the plan stands right now, in the terms someone actually asks it in. */
export function planProgress(days: { done: boolean; date: Date }[], today: Date = new Date()) {
  const start = startOfDay(today);
  const past = days.filter((d) => startOfDay(d.date) <= start);
  const doneCount = days.filter((d) => d.done).length;
  const missed = past.filter((d) => !d.done).length;
  return {
    total: days.length,
    done: doneCount,
    missed,
    pct: days.length ? Math.round((doneCount / days.length) * 100) : 0,
  };
}
