/**
 * My Library: one place that holds everything you have made.
 *
 * The material this app produces was scattered across the pages that happened
 * to create it — flashcards under School, photographed notes inside a topic,
 * class recordings somewhere else again. Each page was a good place to MAKE
 * one and a bad place to FIND one later, because finding something means not
 * remembering where you put it.
 *
 * Everything here is pure: what counts as a match, what order things come in,
 * and how many of each kind there are. The page around it does the fetching.
 */

export type LibraryType = "FLASHCARD" | "NOTE" | "RECORDING";

export type LibraryItem = {
  id: string;
  type: LibraryType;
  /** What this is in words, for the badge on the card: "Photo", "Written note", … */
  kind: string;
  title: string;
  /** The second line: a preview, an answer, a summary. Empty when there is none. */
  detail: string;
  /** The subject or topic it belongs to, when it has one. */
  context: string | null;
  createdAt: Date;
  /** Where clicking it goes — the page that owns the thing. */
  href: string;
  folderId: string | null;
};

export const LIBRARY_TABS: { value: "ALL" | LibraryType; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "FLASHCARD", label: "Flashcards" },
  { value: "NOTE", label: "Notes" },
  // Not "Podcasts". This app records classes; it does not make podcasts, and a
  // tab for something that can never have anything in it is a dead end with a
  // label on it.
  { value: "RECORDING", label: "Recordings" },
];

export type LibrarySort = "NEWEST" | "OLDEST" | "TITLE";

export const LIBRARY_SORTS: { value: LibrarySort; label: string }[] = [
  { value: "NEWEST", label: "Newest" },
  { value: "OLDEST", label: "Oldest" },
  { value: "TITLE", label: "A–Z" },
];

export type LibraryView = "GRID" | "LIST";

/**
 * Folds case and strips accents, so searching "ubung" finds "Übung".
 *
 * Someone typing on a phone keyboard in a hurry does not reach for the umlaut,
 * and a search that only matches what was typed exactly is a search that keeps
 * telling you that you own nothing.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Every word typed must appear somewhere in the item — order does not matter. */
export function matchesQuery(item: LibraryItem, query: string): boolean {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalizeForSearch([item.title, item.detail, item.context ?? "", item.kind].join(" "));
  return terms.every((term) => haystack.includes(term));
}

export function sortItems(items: LibraryItem[], sort: LibrarySort): LibraryItem[] {
  const sorted = [...items];
  if (sort === "TITLE") {
    // Locale-aware, so ä sorts with a rather than after z.
    sorted.sort((a, b) => a.title.localeCompare(b.title, "de"));
    return sorted;
  }
  sorted.sort((a, b) =>
    sort === "OLDEST"
      ? a.createdAt.getTime() - b.createdAt.getTime()
      : b.createdAt.getTime() - a.createdAt.getTime()
  );
  return sorted;
}

export type LibraryCounts = Record<"ALL" | LibraryType, number>;

/**
 * The numbers on the tabs.
 *
 * Counted BEFORE the type filter is applied and after the search and folder
 * filters, so the tabs say how many results each kind would give — a tab
 * reading 0 while its own list has things in it is the kind of small lie that
 * makes people stop trusting the rest of the screen.
 */
export function countsByType(items: LibraryItem[]): LibraryCounts {
  const counts: LibraryCounts = { ALL: items.length, FLASHCARD: 0, NOTE: 0, RECORDING: 0 };
  for (const item of items) counts[item.type]++;
  return counts;
}

export function parseType(value: string | undefined): "ALL" | LibraryType {
  return LIBRARY_TABS.some((tab) => tab.value === value) ? (value as "ALL" | LibraryType) : "ALL";
}

export function parseSort(value: string | undefined): LibrarySort {
  return LIBRARY_SORTS.some((sort) => sort.value === value) ? (value as LibrarySort) : "NEWEST";
}

export function parseView(value: string | undefined): LibraryView {
  return value === "LIST" ? "LIST" : "GRID";
}

export type LibraryFilter = {
  query: string;
  type: "ALL" | LibraryType;
  sort: LibrarySort;
  /** null means "everything", a string means one folder, "UNFILED" means no folder. */
  folderId: string | null | "UNFILED";
};

export type LibraryResult = {
  items: LibraryItem[];
  /** Counts for the tabs: after search and folder, before the type filter. */
  counts: LibraryCounts;
  total: number;
};

export function filterLibrary(all: LibraryItem[], filter: LibraryFilter): LibraryResult {
  const inScope = all.filter((item) => {
    if (filter.folderId === "UNFILED" && item.folderId !== null) return false;
    if (typeof filter.folderId === "string" && filter.folderId !== "UNFILED" && item.folderId !== filter.folderId) {
      return false;
    }
    return matchesQuery(item, filter.query);
  });

  const counts = countsByType(inScope);
  const typed = filter.type === "ALL" ? inScope : inScope.filter((item) => item.type === filter.type);

  return { items: sortItems(typed, filter.sort), counts, total: all.length };
}

export const MAX_FOLDER_NAME = 40;

export type FolderNameResult = { ok: true; name: string } | { ok: false; error: string };

export function parseFolderName(raw: unknown): FolderNameResult {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Give the folder a name." };
  if (name.length > MAX_FOLDER_NAME) {
    return { ok: false, error: `Keep the name under ${MAX_FOLDER_NAME} characters.` };
  }
  return { ok: true, name };
}

export type LibraryTable = "flashcard" | "note" | "log" | "recording";

/**
 * The item ids the library hands out are prefixed — "flashcard-abc" — because
 * four tables can each produce an id and one page needs them unique.
 *
 * This turns one back into a table and a row id, and refuses anything whose
 * shape it does not recognise rather than guessing: the id goes on to pick
 * which table gets written to.
 */
export function splitLibraryItemId(itemId: string): { table: LibraryTable; id: string } | null {
  const match = /^(flashcard|note|log|recording)-([A-Za-z0-9_-]+)$/.exec(itemId);
  if (!match) return null;
  return { table: match[1] as LibraryTable, id: match[2] };
}
