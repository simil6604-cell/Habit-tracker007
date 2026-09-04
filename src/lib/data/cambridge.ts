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
