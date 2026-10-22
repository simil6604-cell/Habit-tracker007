import type { ClassroomCourse, ClassroomSubmission, ClassroomWork } from "./classroom";

/**
 * Deciding what a sync should write, as a pure function.
 *
 * Separated from the database on purpose: every rule worth getting right is
 * here, and all of them are the kind that only show their teeth on the second
 * sync — the one that must not duplicate what the first one created, and must
 * not undo what you changed in between.
 */

export const IMPORT_SOURCE = "GOOGLE_CLASSROOM";

/** How far back to bother importing. Last term's finished work is noise. */
export const IMPORT_WINDOW_DAYS = 30;

export type ExistingHomework = {
  id: string;
  externalId: string | null;
  source: string;
  status: string;
};

export type PlannedHomework = {
  externalId: string;
  subjectId: string | null;
  title: string;
  description: string | null;
  dueDate: Date;
  status: string;
  link: string | null;
  grade: number | null;
  maxPoints: number | null;
};

export type ImportPlan = {
  create: PlannedHomework[];
  update: { id: string; data: Omit<PlannedHomework, "externalId"> }[];
  /** Counted and reported rather than silently dropped. */
  skippedNoDueDate: number;
  skippedTooOld: number;
};

/**
 * The id this row is known by here.
 *
 * Namespaced with the source, so a second kind of import can never collide
 * with a Classroom id and quietly overwrite someone's homework.
 */
export function externalIdFor(courseId: string, courseWorkId: string): string {
  return `gc:${courseId}:${courseWorkId}`;
}

/**
 * Matching a Classroom course to a subject already in the app.
 *
 * Compared in JavaScript rather than in the query because SQLite's `=` is
 * case-sensitive: "chemistry" would not find "Chemistry", and every import
 * would land unfiled.
 */
export function matchSubject(
  course: ClassroomCourse,
  subjects: { id: string; name: string }[]
): { id: string; name: string } | null {
  const candidates = [course.name, course.section].filter((c): c is string => Boolean(c));
  for (const candidate of candidates) {
    const needle = candidate.trim().toLowerCase();
    const exact = subjects.find((s) => s.name.trim().toLowerCase() === needle);
    if (exact) return exact;
  }
  // A course is often "Chemistry 10b" or "IGCSE Chemistry" — a subject whose
  // whole name appears in the course name is the same subject.
  for (const candidate of candidates) {
    const haystack = candidate.trim().toLowerCase();
    const contained = subjects
      .filter((s) => s.name.trim().length >= 3 && haystack.includes(s.name.trim().toLowerCase()))
      // Longest first, so "Further Maths" wins over "Maths".
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (contained) return contained;
  }
  return null;
}

/**
 * What the app should show as the state of this piece of work.
 *
 * Classroom is the authority on whether something was handed in, but it knows
 * nothing about work done and not yet submitted. So a hand-in always wins,
 * and a row you marked done here is never dragged back to pending by a sync
 * that merely notes you have not uploaded anything.
 */
export function statusFor(
  submission: ClassroomSubmission | undefined,
  due: Date,
  now: Date,
  existingStatus?: string
): string {
  if (submission && (submission.state === "TURNED_IN" || submission.state === "RETURNED")) return "DONE";
  if (existingStatus === "DONE") return "DONE";
  if (due.getTime() < now.getTime()) return "MISSED";
  return "PENDING";
}

/**
 * The course name kept with the work when nothing in the app matches it.
 *
 * Without this an imported row reads "Worksheet 3" with no clue which class
 * it belongs to. Recomputed identically on every sync, so it does not grow.
 */
function describe(work: ClassroomWork, course: ClassroomCourse, matched: boolean): string | null {
  if (matched) return work.description;
  const prefix = `From ${course.name}${course.section ? ` (${course.section})` : ""}`;
  return work.description ? `${prefix}\n\n${work.description}` : prefix;
}

export function planImport({
  courses,
  work,
  submissions,
  subjects,
  existing,
  now,
}: {
  courses: ClassroomCourse[];
  work: ClassroomWork[];
  submissions: ClassroomSubmission[];
  subjects: { id: string; name: string }[];
  existing: ExistingHomework[];
  now: Date;
}): ImportPlan {
  const byCourse = new Map(courses.map((c) => [c.id, c]));
  const submissionFor = new Map(submissions.map((s) => [s.courseWorkId, s]));
  const existingById = new Map(
    existing.filter((e) => e.externalId !== null).map((e) => [e.externalId as string, e])
  );

  const cutoff = new Date(now.getTime() - IMPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const plan: ImportPlan = { create: [], update: [], skippedNoDueDate: 0, skippedTooOld: 0 };

  for (const item of work) {
    const course = byCourse.get(item.courseId);
    if (!course) continue;

    if (!item.due) {
      // Never invent a date: an assignment with no deadline would otherwise
      // appear as due today and push everything real down the list.
      plan.skippedNoDueDate++;
      continue;
    }
    if (item.due.getTime() < cutoff.getTime()) {
      plan.skippedTooOld++;
      continue;
    }

    const externalId = externalIdFor(item.courseId, item.id);
    const current = existingById.get(externalId);
    const submission = submissionFor.get(item.id);
    const subject = matchSubject(course, subjects);

    const data = {
      subjectId: subject?.id ?? null,
      title: item.title,
      description: describe(item, course, Boolean(subject)),
      dueDate: item.due,
      status: statusFor(submission, item.due, now, current?.status),
      link: item.link,
      grade: submission?.grade ?? null,
      maxPoints: item.maxPoints,
    };

    if (!current) {
      plan.create.push({ externalId, ...data });
      continue;
    }
    // A row someone typed in themselves is theirs, whatever id it carries.
    if (current.source !== IMPORT_SOURCE) continue;
    plan.update.push({ id: current.id, data });
  }

  return plan;
}
