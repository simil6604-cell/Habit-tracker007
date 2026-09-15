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
export const SUBJECT_LEVELS = [
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
  "Second Language",
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
