import type { CalendarItem } from "@/lib/calendar/items";

export const CATEGORY_META: Record<CalendarItem["category"], { emoji: string; color: string; label: string }> = {
  SCHOOL: { emoji: "🎓", color: "var(--cat-school)", label: "School" },
  STUDY: { emoji: "📚", color: "var(--cat-study)", label: "Study" },
  GYM: { emoji: "🏋️", color: "var(--cat-gym)", label: "Gym" },
  FOOTBALL: { emoji: "⚽", color: "var(--cat-football)", label: "Football" },
  EXAM: { emoji: "📝", color: "var(--cat-exam)", label: "Exam" },
  TASK: { emoji: "✅", color: "var(--cat-task)", label: "Task" },
  RECOVERY: { emoji: "😴", color: "var(--cat-recovery)", label: "Recovery" },
};
