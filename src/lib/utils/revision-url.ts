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
