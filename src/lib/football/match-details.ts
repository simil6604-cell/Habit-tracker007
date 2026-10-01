/**
 * The three things a match needs besides who you are playing: when, where,
 * and anything the fixture list does not carry.
 *
 * Kept out of the action so the rules are testable without a database. They
 * are small, and every one of them exists because of how this gets filled in
 * on a phone the evening before.
 */

export const MAX_LOCATION = 120;
export const MAX_MATCH_NOTE = 300;

/** One line of free text, trimmed, with pasted line breaks flattened. */
export function cleanLine(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.slice(0, max);
}

/** Several lines kept as lines — a note is where "Besammlung 13:00" goes. */
export function cleanNote(raw: unknown, max = MAX_MATCH_NOTE): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  return text.slice(0, max);
}

/**
 * What a datetime-local field gives you, as a real date — or null.
 *
 * `new Date("")` is Invalid Date, and Prisma stores that without complaint on
 * some drivers and throws on others; either way the match is gone. Checked
 * here instead, where it is one line.
 */
export function parseMatchDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * "vs FC Baar · Sat, 12 Apr · 14:00 · Herti" — the line you read on the way
 * out of the door, with the parts that are missing simply absent rather than
 * printed as a dash.
 */
export function matchWhereLine(match: { isHome: boolean; location: string | null }): string | null {
  if (match.location) return match.location;
  // Without a place, home and away is still worth saying — it is the one
  // thing you always know.
  return match.isHome ? "Home" : "Away";
}
