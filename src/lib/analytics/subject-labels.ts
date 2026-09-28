/**
 * Subject names, cut down to the subject.
 *
 * A real timetable is full of names like "German — First Language" and
 * "Economics A-Level". On a chart axis those wrap to three lines, push the
 * plot into a sliver and say nothing the reader did not already know: you
 * know which level you take. What the axis needs is the subject.
 *
 * The one thing this must never do is make two different subjects look like
 * the same one. "English Language" and "English Literature" are two papers,
 * two grades and two sets of revision, so the shortening is applied to the
 * whole list at once and any cut that would collide is undone for the rows
 * that collide — those keep their full name and stay honest.
 */

/** Cut here and drop everything after: these introduce a qualifier, not a subject. */
const SEPARATORS = [" — ", " – ", " - ", " · ", ": ", " ("];

/**
 * Stream and qualification words, removed wherever they appear.
 *
 * Longest first, so "A-Levels" is taken before "A-Level" and "First Language"
 * before "Language" — otherwise the shorter match leaves a fragment behind.
 */
const QUALIFIERS = [
  "First Language",
  "Second Language",
  "Foreign Language",
  "Higher Level",
  "Standard Level",
  "A-Levels",
  "A Levels",
  "A-Level",
  "A Level",
  "AS-Level",
  "AS Level",
  "IGCSE",
  "GCSE",
  "IB",
  "HL",
  "SL",
];

/** Words worth dropping, but only when the result stays unique in the list. */
const OPTIONAL = ["Language", "Literature", "Studies"];

function tidy(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[–—\-·:,]+$/, "").trim();
}

function stripQualifiers(name: string): string {
  let out = name;
  for (const qualifier of QUALIFIERS) {
    // Word-bounded so "IB" does not eat the "IB" inside a longer word.
    out = out.replace(new RegExp(`\\b${qualifier.replace(/[-\s]/g, "[-\\s]")}\\b`, "gi"), " ");
  }
  return tidy(out);
}

/** One name, cut at the first separator and stripped of level words. */
export function shortSubjectName(name: string): string {
  let out = name.trim();
  for (const separator of SEPARATORS) {
    const at = out.indexOf(separator);
    if (at > 0) out = out.slice(0, at);
  }
  const stripped = stripQualifiers(out);
  // Never return nothing: a subject called exactly "IGCSE" keeps its name
  // rather than becoming an empty axis label.
  return stripped || tidy(out) || name.trim();
}

/**
 * Shorten a whole list, refusing any cut that would merge two subjects.
 *
 * Returns labels in the same order as the input.
 */
export function shortSubjectNames(names: string[]): string[] {
  const firstPass = names.map(shortSubjectName);

  // The optional words come off only if every result stays distinct.
  const candidate = firstPass.map((name) => {
    let out = name;
    for (const word of OPTIONAL) {
      const shorter = tidy(out.replace(new RegExp(`\\b${word}\\b`, "gi"), " "));
      // Only when something is left: "Literature" on its own is the subject.
      if (shorter) out = shorter;
    }
    return out;
  });

  const counts = new Map<string, number>();
  for (const name of candidate) counts.set(name.toLowerCase(), (counts.get(name.toLowerCase()) ?? 0) + 1);

  return candidate.map((short, i) => {
    const collides = (counts.get(short.toLowerCase()) ?? 0) > 1;
    // A collision after the optional cut falls back to the first pass, which
    // still has "Language" or "Literature" on it and tells the two apart.
    return collides ? firstPass[i] : short;
  });
}
