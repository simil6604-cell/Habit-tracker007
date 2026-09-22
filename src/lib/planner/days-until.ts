import { differenceInCalendarDays } from "date-fns";

/**
 * Days until a dated thing, counted the way a person counts them.
 *
 * "In two days" means the day after tomorrow, not forty-eight hours. The app
 * used to divide the millisecond gap and round it, in four separate places,
 * which is a different question with a different answer: at eight in the
 * evening an exam the next morning is eleven hours away, rounds to zero, and
 * the coach says "your exam is in 0 days" about tomorrow. Every countdown
 * shifted by one after mid-afternoon — which is exactly when someone opens the
 * app to plan the evening's revision.
 *
 * Calendar days, floored at zero: today is 0, tomorrow is 1, and a date that
 * has passed is 0 rather than a negative number nobody wants to read.
 */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.max(0, differenceInCalendarDays(date, now));
}

/** The same count, phrased: "today", "tomorrow", "in 3 days". */
export function daysUntilLabel(date: Date, now: Date = new Date()): string {
  const days = daysUntil(date, now);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
