// Simplified SM-2 spaced-repetition scheduler.

export type ReviewResult = "AGAIN" | "HARD" | "GOOD" | "EASY";

const QUALITY: Record<ReviewResult, number> = {
  AGAIN: 0,
  HARD: 3,
  GOOD: 4,
  EASY: 5,
};

export function schedule(
  current: { interval: number; easeFactor: number; repetitions: number },
  result: ReviewResult
) {
  const q = QUALITY[result];
  let easeFactor = current.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  easeFactor = Math.max(1.3, Number(easeFactor.toFixed(2)));

  let repetitions = current.repetitions;
  let interval = current.interval;

  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(current.interval * easeFactor);
  }

  const dueDate = new Date(Date.now() + interval * 24 * 60 * 60 * 1000);
  return { interval, easeFactor, repetitions, dueDate };
}

export function reviewBucket(dueDate: Date, interval: number): "NEEDS_REVIEW" | "DUE_TODAY" | "MASTERED" {
  const now = new Date();
  if (dueDate < now) return "NEEDS_REVIEW";
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  if (dueDate >= startOfToday && dueDate < endOfToday) return "DUE_TODAY";
  if (interval >= 21) return "MASTERED";
  return "DUE_TODAY";
}
