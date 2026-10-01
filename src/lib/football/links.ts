import { normalizeUserUrl, revisionHost } from "@/lib/utils/revision-url";

/**
 * The pages of a league's own site, saved as links you tap.
 *
 * The importer that reads a table into the app is a separate thing and stays:
 * once the rows are in, the app can rank you, count the gap to first and scout
 * the next opponent. But it needs this server to fetch the page, and a lot of
 * league sites refuse a server (matchcenter.el-pl.ch answers 403) or render
 * their table in the browser, leaving nothing in the HTML to read.
 *
 * A link has neither problem. It is the one route to a league page that cannot
 * fail for a reason outside this app, so the table, the fixtures and the
 * results get a button each.
 */

export const LINK_KINDS = [
  { value: "TABLE", label: "Table", hint: "The league standings" },
  { value: "FIXTURES", label: "Fixtures", hint: "The games still to play" },
  { value: "RESULTS", label: "Results", hint: "Scores already played" },
  { value: "TEAM", label: "My team", hint: "Your team's own page" },
  { value: "OTHER", label: "Other", hint: "Anything else on the league site" },
] as const;

export type LinkKind = (typeof LINK_KINDS)[number]["value"];

const KIND_VALUES = LINK_KINDS.map((k) => k.value) as readonly string[];

/** The label for a stored kind, falling back to Other for anything unknown. */
export function kindLabel(kind: string): string {
  return LINK_KINDS.find((k) => k.value === kind)?.label ?? "Other";
}

export const MAX_LINK_TITLE = 60;

export type StoredLink = { id: string; kind: string; title: string; url: string };

export type ParsedLink = { ok: true; kind: LinkKind; title: string; url: string } | { ok: false; error: string };

/**
 * Everything a saved link needs, checked before it is stored.
 *
 * The URL ends up in an href, so the scheme is the whole point — a
 * `javascript:` link there runs code the moment you tap your own button. Only
 * http and https survive, which is what parseRevisionUrl already enforces for
 * the school's revision links.
 *
 * A missing title is not an error: the site's own hostname is a better name
 * than an empty button, and it is what you would have typed anyway.
 */
export function parseLink(rawUrl: unknown, rawTitle: unknown, rawKind: unknown): ParsedLink {
  const url = normalizeUserUrl(typeof rawUrl === "string" ? rawUrl : "");
  if (!url) {
    return {
      ok: false,
      error:
        "No web address in that. Open the page in your browser, copy the address from the top bar, and paste the whole thing here.",
    };
  }

  const kindRaw = typeof rawKind === "string" ? rawKind : "";
  const kind = (KIND_VALUES.includes(kindRaw) ? kindRaw : "OTHER") as LinkKind;

  const typed = (typeof rawTitle === "string" ? rawTitle : "").trim().replace(/\s+/g, " ");
  if (typed.length > MAX_LINK_TITLE) {
    return { ok: false, error: `Keep the name under ${MAX_LINK_TITLE} characters.` };
  }
  // Unnamed, the kind is the better name: the host is printed underneath
  // anyway, and a league's table and fixtures live on the same site, so naming
  // both after it gives two buttons reading "matchcenter.el-pl.ch". "Other"
  // says nothing, so there the host is still the best there is.
  const title = typed || (kind === "OTHER" ? revisionHost(url) : kindLabel(kind)) || kindLabel(kind);

  return { ok: true, kind, title, url };
}

/**
 * The small print under a link's name: what it is, and where it goes.
 *
 * The kind drops out when it is already the name, so an unnamed fixtures link
 * reads "Fixtures / matchcenter.el-pl.ch" rather than saying Fixtures twice.
 */
export function linkSubtitle(link: { kind: string; title: string; url: string }): string {
  const kind = kindLabel(link.kind);
  const host = revisionHost(link.url);
  return [kind === link.title ? null : kind, host].filter(Boolean).join(" · ");
}

/**
 * Saved links in the order they are useful, not the order they were added.
 *
 * Table first because that is what you open after a game, then what is coming,
 * then what has been. Within a kind the newest is first, which is how a link
 * that replaced an older one ends up on top without anything being deleted.
 */
export function orderLinks<T extends { kind: string }>(links: T[]): T[] {
  const rank = (kind: string) => {
    const index = KIND_VALUES.indexOf(kind);
    return index === -1 ? KIND_VALUES.length : index;
  };
  return [...links].sort((a, b) => rank(a.kind) - rank(b.kind));
}

/** The site a link points at, for the small print under its name. */
export function linkHost(url: string): string | null {
  return revisionHost(url);
}
