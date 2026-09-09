import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";

export type ImportedStanding = {
  rank: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

export type ImportResult = { ok: true; data: ImportedStanding[] } | { ok: false; error: string };

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(tr|p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Fetches a league-table webpage and asks the connected AI to extract the
 * standings as structured rows — handles the common Swiss/German/French
 * column headers without needing to know each site's exact HTML layout.
 * Never invents a row: if the page can't be reached or no table is found,
 * it returns an honest error instead of guessing.
 */
export async function fetchAndParseStandings(url: string): Promise<ImportResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Only http/https links are supported." };
  }

  let html: string;
  try {
    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MomentumApp/1.0; +https://example.com)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, error: `The page returned an error (HTTP ${res.status}).` };
    html = await res.text();
  } catch (err) {
    return { ok: false, error: `Couldn't reach that page (${err instanceof Error ? err.message : "unknown error"}).` };
  }

  if (!isRealAIConfigured) {
    return {
      ok: false,
      error: "Reading a table from a link needs a real AI — set ANTHROPIC_API_KEY in Settings, or enter standings manually below.",
    };
  }

  const text = htmlToText(html).slice(0, 18000);
  if (text.length < 50) {
    return { ok: false, error: "That page came back empty — it may need JavaScript to load, which this can't render." };
  }

  const prompt = `Below is text extracted from a football/soccer league standings webpage. It may be in German, French, Italian or English. Find the league table and extract EVERY row as a JSON array, one object per team, with exactly these fields: rank (integer), teamName (string), played (integer), won (integer), drawn (integer), lost (integer), goalsFor (integer), goalsAgainst (integer), points (integer).

Common German headers: Rang=rank, Verein/Team/Mannschaft=teamName, Sp/Spiele=played, S/Siege=won, U/Unentschieden=drawn, N/Niederlagen=lost, Tore (shown as "12:5")=goalsFor:goalsAgainst, Pkt/Punkte=points. Ignore a "Diff" column — it's derived, not one of the fields above.

Respond with ONLY the JSON array — no explanation, no markdown code fences. If you cannot find a clear standings table in this text, respond with exactly: NONE

---
${text}`;

  let raw: string;
  try {
    raw = await getAIProvider().generate(prompt, { maxTokens: 3000 });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The AI couldn't process that page." };
  }

  const trimmed = raw.trim();
  if (trimmed === "NONE" || trimmed.length === 0) {
    return { ok: false, error: "Couldn't find a standings table on that page — double-check the link, or enter standings manually below." };
  }

  let data: unknown;
  try {
    const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
    data = JSON.parse(jsonMatch ? jsonMatch[0] : trimmed);
  } catch {
    return { ok: false, error: "The AI's response wasn't valid table data — try again, or enter standings manually below." };
  }

  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: "No standings rows found on that page." };
  }

  const rows: ImportedStanding[] = [];
  for (const row of data) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const teamName = typeof r.teamName === "string" ? r.teamName.trim() : "";
    if (!teamName) continue;
    rows.push({
      rank: Number(r.rank) || 0,
      teamName,
      played: Number(r.played) || 0,
      won: Number(r.won) || 0,
      drawn: Number(r.drawn) || 0,
      lost: Number(r.lost) || 0,
      goalsFor: Number(r.goalsFor) || 0,
      goalsAgainst: Number(r.goalsAgainst) || 0,
      points: Number(r.points) || 0,
    });
  }

  if (rows.length === 0) {
    return { ok: false, error: "Couldn't parse any valid rows from that page's table." };
  }

  rows.sort((a, b) => a.rank - b.rank);
  return { ok: true, data: rows };
}
