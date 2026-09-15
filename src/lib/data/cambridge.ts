// Reference lists only: subject names and education-system labels.
// This app never invents official Cambridge syllabus CONTENT (topics, grade
// boundaries, past papers). Detailed syllabus breakdowns must be imported
// from the official Cambridge International documents by the user, or
// entered manually under a subject's Topics screen.

export const EDUCATION_SYSTEMS = [
  { value: "IGCSE", label: "Cambridge IGCSE" },
  { value: "AS_LEVEL", label: "Cambridge International AS Level" },
  { value: "A_LEVEL", label: "Cambridge International A Level" },
  { value: "OTHER", label: "Other / national curriculum" },
] as const;

export type EducationSystem = (typeof EDUCATION_SYSTEMS)[number]["value"];

/**
 * The level an individual subject is sat at. IGCSE splits into Core and
 * Extended tiers, which cap at different grades and cover different content,
 * so the AI has to know which tier a subject is on, not just "IGCSE".
 * `system` ties each level back to the education systems the student ticked.
 */
/**
 * Only some Cambridge IGCSE syllabuses are tiered into Core and Extended —
 * the sciences, Maths and English as a Second Language. Everything else is a
 * single paper set, so asking Core/Extended there is a meaningless question.
 */
export const IGCSE_TIERED_SUBJECTS = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Combined Science",
  // The modern-language syllabuses (German, French…) aren't tiered; English as
  // a Second Language is.
  "English as a Second Language",
];

/**
 * Syllabuses that exist only at IGCSE. At AS/A Level you are on the advanced
 * syllabus by definition, so offering the foundation-level variants there
 * would let a student record a qualification that doesn't exist.
 */
export const IGCSE_ONLY_SUBJECTS = [
  "Combined Science",
  "Additional Mathematics",
  "English as a Second Language",
  "German — Second Language",
];

/** Syllabuses that only start at AS/A Level. */
export const ADVANCED_ONLY_SUBJECTS = ["Further Mathematics"];

/** The subjects worth offering under a given education system. */
export function subjectsForSystem(system: string): string[] {
  if (system === "IGCSE") return CAMBRIDGE_SUBJECTS.filter((s) => !ADVANCED_ONLY_SUBJECTS.includes(s));
  if (system === "AS_LEVEL" || system === "A_LEVEL") {
    return CAMBRIDGE_SUBJECTS.filter((s) => !IGCSE_ONLY_SUBJECTS.includes(s));
  }
  return CAMBRIDGE_SUBJECTS;
}

export const SUBJECT_LEVELS = [
  { value: "IGCSE", label: "IGCSE", short: "IGCSE", system: "IGCSE" },
  { value: "IGCSE_CORE", label: "IGCSE — Core", short: "Core", system: "IGCSE" },
  { value: "IGCSE_EXTENDED", label: "IGCSE — Extended", short: "Extended", system: "IGCSE" },
  { value: "AS_LEVEL", label: "AS Level", short: "AS", system: "AS_LEVEL" },
  { value: "A_LEVEL", label: "A Level", short: "A Level", system: "A_LEVEL" },
  { value: "OTHER", label: "Other", short: "Other", system: "OTHER" },
] as const;

export type SubjectLevel = (typeof SUBJECT_LEVELS)[number]["value"];

/** The levels worth offering, given which education systems the student ticked. */
export function levelsForSystems(systems: string[]) {
  const active = SUBJECT_LEVELS.filter((l) => systems.includes(l.system));
  return active.length ? active : SUBJECT_LEVELS;
}

export const CAMBRIDGE_SUBJECTS = [
  "Mathematics",
  "Additional Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Combined Science",
  "Economics",
  "Business",
  "Computer Science",
  "English Language",
  "English Literature",
  "Geography",
  "History",
  "ICT",
  "Global Perspectives",
  "Accounting",
  "Psychology",
  "Sociology",
  "Art & Design",
  "Physical Education",
  "Further Mathematics",
  // Cambridge runs First Language and Foreign/Second Language German as
  // separate syllabuses at very different levels, so they're separate subjects.
  "German — First Language",
  "German — Second Language",
  "French",
  "Spanish",
  "Italian",
  "Latin",
  "Mandarin Chinese",
  "English as a Second Language",
];

export const SUBJECT_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f97316",
  "#ef4444",
  "#0ea5e9",
  "#8b5cf6",
  "#eab308",
  "#14b8a6",
  "#ec4899",
  "#84cc16",
];
