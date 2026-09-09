import type { AgendaItem } from "./agenda";

export type PriorityReminder = {
  icon: string;
  domain: "school" | "gym" | "football" | null;
  text: string;
};

/**
 * Picks the single most important thing to know before choosing a domain
 * today — reasoning only over real agenda items already fetched for the
 * home page, never invented. Highest-stakes items (an exam) win over
 * routine ones (a scheduled workout).
 */
export function pickPriorityReminder(today: AgendaItem[], tomorrow: AgendaItem[]): PriorityReminder {
  const examToday = today.find((i) => i.category === "EXAM");
  if (examToday) {
    return {
      icon: "📚",
      domain: "school",
      text: `You have an exam today${examToday.meta ? ` — ${examToday.meta}` : ""}: ${examToday.title}. Everything else can wait.`,
    };
  }

  const examTomorrow = tomorrow.find((i) => i.category === "EXAM");
  if (examTomorrow) {
    return {
      icon: "📚",
      domain: "school",
      text: `Exam tomorrow${examTomorrow.meta ? ` — ${examTomorrow.meta}` : ""}: ${examTomorrow.title}. Make today's revision priority one.`,
    };
  }

  const matchToday = today.find((i) => i.category === "FOOTBALL" && i.title.startsWith("Match"));
  if (matchToday) {
    return {
      icon: "⚽",
      domain: "football",
      text: `${matchToday.title}${matchToday.time ? ` at ${matchToday.time}` : ""} — go easy on the gym today and focus on being ready.`,
    };
  }

  const homeworkToday = today.find((i) => i.category === "SCHOOL");
  if (homeworkToday) {
    return {
      icon: "🎓",
      domain: "school",
      text: `Homework due today${homeworkToday.meta ? ` — ${homeworkToday.meta}` : ""}: ${homeworkToday.title}.`,
    };
  }

  const trainingToday = today.find((i) => i.category === "FOOTBALL");
  const gymToday = today.find((i) => i.category === "GYM");
  if (gymToday && trainingToday) {
    return { icon: "🏋️", domain: "gym", text: `Gym (${gymToday.title}) and football (${trainingToday.title}) are both on today — plan your energy across both.` };
  }
  if (gymToday) {
    return { icon: "🏋️", domain: "gym", text: `${gymToday.title}${gymToday.time ? ` at ${gymToday.time}` : ""} is scheduled today.` };
  }
  if (trainingToday) {
    return { icon: "⚽", domain: "football", text: `${trainingToday.title}${trainingToday.time ? ` at ${trainingToday.time}` : ""} is scheduled today.` };
  }

  const taskToday = today.find((i) => i.category === "TASK");
  if (taskToday) {
    return { icon: "✅", domain: null, text: `Don't forget: ${taskToday.title} is due today.` };
  }

  return { icon: "👍", domain: null, text: "Nothing urgent is on record for today — pick whichever area you want to make progress on." };
}
