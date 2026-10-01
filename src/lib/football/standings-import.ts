import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";
import { fetchPublicUrl } from "@/lib/net/public-url";

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
  // The fetch happens on the server, inside the deployment's own network, from
  // a link the user typed. Checking that it says http:// proves nothing about
  // where it goes: http://169.254.169.254/ and http://127.0.0.1:5432/ pass that
  // check and reach places no browser could. fetchPublicUrl resolves the name
  // first and refuses anything private, on the first request and on every
  // redirect.
  const fetched = await fetchPublicUrl(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MomentumApp/1.0; +https://example.com)" },
    timeoutMs: 15000,
  });
  if (!fetched.ok) return { ok: false, error: fetched.error };

  let html: string;
  try {
    if (!fetched.response.ok) return { ok: false, error: `The page returned an error (HTTP ${fetched.response.status}).` };
    html = await fetched.response.text();
  } catch (err) {
    return { ok: false, error: `Couldn't read that page (${err instanceof Error ? err.message : "unknown error"}).` };
  }

  if (!isRealAIConfigured) {
    return {
      ok: false,
      error: "Reading a table from a link needs a real AI — set ANTHROPIC_API_KEY in Settings, or enter standings manually below.",
    };
  }

  const text = htmlToText(html).slice(0, 18000);
  if (text.length < 50) {
    return {
      ok: false,
      error:
        "That page was reached, but it came back with no readable text — it builds its table in the browser with JavaScript, which this cannot run. Enter the table by hand below instead.",
    };
  }

  return parseStandingsText(text);
}

/** How much pasted text is worth sending — a league table is a few hundred characters. */
export const MAX_PASTED_TABLE = 18000;

/**
 * The same rows, from text the person copied out of their own browser.
 *
 * Some league pages build their table with JavaScript, and some cannot be
 * reached from this server at all. The browser sitting in front of the page
 * has neither problem: select the table, copy, paste. It is the one route
 * that works whatever the site does, and it needs no permission from anyone.
 */
export async function importStandingsFromText(raw: string): Promise<ImportResult> {
  const text = raw.trim().slice(0, MAX_PASTED_TABLE);
  if (text.length < 20) {
    return { ok: false, error: "Paste the table itself — select it on the league page, copy, and paste it here." };
  }
  if (!isRealAIConfigured) {
    return {
      ok: false,
      error: "Reading a pasted table needs a real AI — set ANTHROPIC_API_KEY in Settings, or enter the rows by hand below.",
    };
  }
  return parseStandingsText(text);
}

/**
 * What the model is asked for, in one place.
 *
 * Shared by the three ways a table gets in — a fetched page, a pasted block,
 * a photograph. They differ only in what the table arrives as; the columns,
 * the German headers and the refusal word are the same question every time,
 * and three copies of it would answer three slightly different questions.
 */
export const STANDINGS_TASK = `Find the league table and extract EVERY row as a JSON array, one object per team, with exactly these fields: rank (integer), teamName (string), played (integer), won (integer), drawn (integer), lost (integer), goalsFor (integer), goalsAgainst (integer), points (integer).

Common German headers: Rang=rank, Verein/Team/Mannschaft=teamName, Sp/Spiele=played, S/Siege=won, U/Unentschieden=drawn, N/Niederlagen=lost, Tore (shown as "12:5")=goalsFor:goalsAgainst, Pkt/Punkte=points. Ignore a "Diff" column — it's derived, not one of the fields above.

Respond with ONLY the JSON array — no explanation, no markdown code fences. If you cannot find a clear standings table, respond with exactly: NONE`;

/**
 * The model's reply, turned into rows — or into a reason there are none.
 *
 * Pure, and separate from the asking, because this is the part that has to
 * survive a model that wrapped its JSON in a code fence, answered in prose,
 * returned an object instead of an array, or filled a column with a dash. It
 * never invents a team: no table is an error rather than a guess, and a row
 * with no name is dropped rather than named.
 */
export function parseStandingsReply(raw: string, noTableError: string): ImportResult {
  const trimmed = raw.trim();
  if (trimmed === "NONE" || trimmed.length === 0) {
    return { ok: false, error: noTableError };
  }

  let data: unknown;
  try {
    const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
    data = JSON.parse(jsonMatch ? jsonMatch[0] : trimmed);
  } catch {
    return { ok: false, error: "The AI's answer was not table data — try again, or enter the rows by hand below." };
  }

  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: noTableError };
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
    return { ok: false, error: "Every row came back without a team name, so there was nothing to save." };
  }

  rows.sort((a, b) => a.rank - b.rank);
  return { ok: true, data: rows };
}

/** Text in, rows out. */
async function parseStandingsText(text: string): Promise<ImportResult> {
  const prompt = `Below is text extracted from a football/soccer league standings webpage. It may be in German, French, Italian or English. ${STANDINGS_TASK}

---
${text}`;

  let raw: string;
  try {
    raw = await getAIProvider().generate(prompt, { maxTokens: 3000 });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The AI couldn't read that." };
  }

  return parseStandingsReply(
    raw,
    "Couldn't find a standings table in that — double-check the link, or enter the rows by hand below."
  );
}

/**
 * The same rows, read off a photograph of the table.
 *
 * This is the route that needs nothing from the league's website at all: no
 * fetch it can refuse, no page that renders in a browser only, no copying on
 * a phone. You take a picture of the table — on the screen or on paper — and
 * the AI in this app reads it.
 *
 * What comes back is shown before it is saved. A model reading a column of
 * numbers off a photo is right most of the time and not all of the time, and
 * a wrong points column quietly changes what the app tells you about the race
 * for first — so the rows are checked by the person who took the photo.
 */
export async function readStandingsFromImage(base64: string, mediaType: string): Promise<ImportResult> {
  if (!isRealAIConfigured) {
    return {
      ok: false,
      error: "Reading a photo needs a real AI — set ANTHROPIC_API_KEY in Settings, or enter the rows by hand below.",
    };
  }

  const prompt = `The image is a photograph or screenshot of a football/soccer league table. It may be in German, French, Italian or English. ${STANDINGS_TASK}`;

  let raw: string;
  try {
    raw = await getAIProvider().generate(prompt, {
      maxTokens: 3000,
      imageBase64: base64,
      imageMediaType: mediaType,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The AI couldn't read that photo." };
  }

  return parseStandingsReply(
    raw,
    "No league table could be read in that picture. Make sure the whole table is in frame and the numbers are sharp, then try again."
  );
}

/**
 * Where the table on screen came from, in one line under the team's name.
 *
 * It used to read "Paste a link to your league's table below" for everything
 * that was not a link — so after reading a table off a photograph the page
 * told you to go and paste a link, about the table it had just filled in.
 */
export function standingsSourceLine(dataSource: string, hasRows: boolean): string {
  if (!hasRows) {
    return "No table yet. Photograph it, paste it, or type the rows in below — nothing here is ever invented.";
  }
  switch (dataSource) {
    case "API":
      return "Read from your league's own table page. Refresh it any time results change.";
    case "PASTED":
      return "Read from the table you pasted. Paste a newer one any time results change.";
    case "PHOTO":
      return "Read from your photo of the table, and checked by you. Photograph it again any time results change.";
    default:
      return "These rows were typed in by hand. Change them below, or read a new table from a photo or a link.";
  }
}
