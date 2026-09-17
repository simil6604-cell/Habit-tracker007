const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"]);

/** A YouTube video id — 11 characters of the URL-safe alphabet. */
function videoId(raw: string | null | undefined): string | null {
  const id = (raw ?? "").trim();
  return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

/**
 * Returns a YouTube embed URL if the given URL is a YouTube link, else null.
 *
 * Two things this is careful about, because the return value becomes an
 * <iframe src>. The host is matched exactly rather than by substring —
 * "youtube.com.attacker.example" contains "youtube.com" — and the embed URL is
 * always rebuilt from the extracted id, so the src is a youtube.com URL by
 * construction and never the string that was passed in.
 */
export function toYouTubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;

    if (SHORT_HOSTS.has(u.hostname)) {
      const id = videoId(u.pathname.slice(1));
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (YOUTUBE_HOSTS.has(u.hostname)) {
      const fromQuery = videoId(u.searchParams.get("v"));
      if (fromQuery) return `https://www.youtube.com/embed/${fromQuery}`;
      const segments = u.pathname.split("/").filter(Boolean);
      if (segments[0] === "embed" || segments[0] === "shorts" || segments[0] === "live") {
        const id = videoId(segments[1]);
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
    }

    return null;
  } catch {
    return null;
  }
}
