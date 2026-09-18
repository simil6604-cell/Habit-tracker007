export const GYM_QUESTIONS = [
  { id: "fitness", label: "How would you rate your current overall fitness level?" },
  { id: "consistency", label: "How consistent has your training been over the last month?" },
  { id: "experience", label: "How experienced are you with structured strength training?" },
];

export const FOOTBALL_QUESTIONS = [
  { id: "technical", label: "How would you rate your technical ability (touch, passing, dribbling)?" },
  { id: "fitness", label: "How would you rate your match fitness / conditioning?" },
  { id: "consistency", label: "How consistent has your training/practice been recently?" },
];

export const SCHOOL_GENERAL_QUESTIONS = [
  { id: "homework-consistency", label: "How consistently do you complete homework on time?" },
  { id: "exam-preparedness", label: "How prepared do you feel for your next exam overall?" },
];

export const CATEGORY_LABELS = {
  SCHOOL: { emoji: "🎓", title: "School" },
  GYM: { emoji: "🏋️", title: "Gym" },
  FOOTBALL: { emoji: "⚽", title: "Football" },
} as const;
