/**
 * The five subject folders, and the dividers inside them.
 *
 * Asked for with a picture of OneNote: a notebook per subject, sections
 * inside it, pages inside those. The folders here are the subjects that were
 * named; the sections are the ones already visible in that picture, because
 * inventing a filing system someone has not asked for is worse than offering
 * the one they clearly already use. All of it is renameable and deletable —
 * this is a starting point, not a structure the app insists on.
 */

export const STARTER_FOLDERS = ["Economics", "Biology", "Mathematics", "English", "German"] as const;

export const STARTER_SECTIONS = ["Lesson notes", "Formative assessment", "Corrections"] as const;

/**
 * What setting this up would actually do, given what is already there.
 *
 * Compared without regard to case, in JavaScript: SQLite's own uniqueness is
 * case-sensitive, so "economics" and "Economics" would both be allowed to
 * exist and the student would end up with two of everything.
 */
export function plannedFolders(existing: string[]): { create: string[]; keep: string[] } {
  const have = new Set(existing.map((name) => name.trim().toLowerCase()));
  const create: string[] = [];
  const keep: string[] = [];
  for (const folder of STARTER_FOLDERS) {
    if (have.has(folder.toLowerCase())) keep.push(folder);
    else create.push(folder);
  }
  return { create, keep };
}

/** Which sections are missing from a folder that already exists. */
export function plannedSections(existing: string[]): string[] {
  const have = new Set(existing.map((name) => name.trim().toLowerCase()));
  return STARTER_SECTIONS.filter((section) => !have.has(section.toLowerCase()));
}
