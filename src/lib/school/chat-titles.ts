/**
 * What a conversation is called in the list.
 *
 * Asked for with a picture of Claude's own sidebar: a list of what you asked
 * before, each with a name, and the names are yours to write. So a title the
 * student typed always wins, and the derived one is never written to the
 * database — if it were, renaming would mean fighting something the app had
 * already decided, and a question edited later would keep an old name
 * forever.
 */

export const MAX_CHAT_TITLE = 60;

/**
 * The name given to messages written before conversations existed.
 *
 * Here rather than beside the code that uses it: that file is a "use server"
 * module, and those may export nothing but async functions.
 */
export const ADOPTED_CHAT_TITLE = "Earlier questions";

/** Trims a typed title to something that fits a row. Empty means "unname it". */
export function cleanChatTitle(raw: string): string | null {
  const title = raw.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_TITLE);
  return title || null;
}

/**
 * A name made from the first thing asked.
 *
 * Cut at a word, never mid-word, and stripped of the markdown and the photo
 * placeholder that a first message can carry — "(sent photos without a
 * question)" is a terrible name for a conversation.
 */
export function derivedChatTitle(firstQuestion: string | null | undefined): string | null {
  const text = (firstQuestion ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#>`]/g, " ")
    .replace(/\(sent photos without a question\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (text.length <= 40) return text;
  const cut = text.slice(0, 40);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 15 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** What to show for a conversation: their name, else one from the question. */
export function chatLabel(chat: { title: string | null; firstQuestion?: string | null }): string {
  return chat.title?.trim() || derivedChatTitle(chat.firstQuestion) || "New chat";
}
