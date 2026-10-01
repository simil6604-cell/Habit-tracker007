/**
 * Validates a revision-site link before it is stored.
 *
 * The value ends up in an href, so the scheme is the whole point: a
 * `javascript:` or `data:` URL there runs code when you tap your own bookmark.
 * Only http and https are kept; anything else — including a malformed URL — is
 * stored as nothing rather than as something that looks like a link.
 */
export function parseRevisionUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** The hostname without "www.", for showing which site a link points at. */
export function revisionHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * What a person actually pastes, turned into a link — or nothing.
 *
 * `parseRevisionUrl` is the gate: only http and https get through, because the
 * value ends up in an href. But it is also the only thing standing between a
 * real league page and a refusal, and it says no to most of what a phone hands
 * you. Sharing a page gives "Tabelle\nhttps://…"; copying the address bar on
 * Android often drops the scheme entirely; a share sheet appends the page
 * title after the link. All three are the right page and all three were
 * refused, with "that is not a web address" — which is not what happened.
 *
 * The opposite failure is worse and was there too: a title pasted after the
 * URL parses fine and is kept *inside* the address, so the button saves and
 * then opens the wrong page, which looks like the site's fault.
 *
 * So: take the first thing in the text that looks like an address, and add
 * https:// only when there is no scheme at all. A string that already carries
 * one keeps it and meets the same gate as before — `javascript:alert(1)` is
 * still refused rather than quietly turned into a link.
 */
export function normalizeUserUrl(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  // Whitespace never belongs inside a pasted address, so the first run of
  // non-space characters is the address and the rest is the title around it.
  const candidate = text.split(/\s+/).find((part) => part.includes(".") || /^[a-z][a-z0-9+.-]*:/i.test(part));
  if (!candidate) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(candidate);
  const withScheme = hasScheme ? candidate : `https://${candidate}`;

  const url = parseRevisionUrl(withScheme);
  if (!url) return null;

  // "https://notes" parses and is not a web address. A real host has a dot.
  try {
    if (!new URL(url).hostname.includes(".")) return null;
  } catch {
    return null;
  }
  return url;
}
