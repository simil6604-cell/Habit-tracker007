import { describe, it, expect } from "vitest";
import {
  countsByType,
  filterLibrary,
  MAX_FOLDER_NAME,
  matchesQuery,
  normalizeForSearch,
  parseFolderName,
  parseSort,
  parseType,
  parseView,
  sortItems,
  splitLibraryItemId,
  type LibraryItem,
} from "@/lib/library/library";

function item(over: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: "1",
    type: "FLASHCARD",
    kind: "Flashcard",
    title: "Osmosis",
    detail: "water moves to the higher solute concentration",
    context: "Biology",
    createdAt: new Date(2026, 8, 20),
    href: "/school/flashcards",
    folderId: null,
    ...over,
  };
}

describe("normalizeForSearch", () => {
  it("folds case and strips accents", () => {
    expect(normalizeForSearch("  ÜBUNG  ")).toBe("ubung");
    expect(normalizeForSearch("Français")).toBe("francais");
  });
});

describe("matchesQuery", () => {
  it("finds an accented title from an unaccented search", () => {
    // Nobody reaches for the umlaut key on a phone. A search that only matched
    // exactly what was typed would keep saying you own nothing.
    expect(matchesQuery(item({ title: "Übungsblatt 4" }), "ubung")).toBe(true);
  });

  it("matches every word, in any order", () => {
    const card = item({ title: "Ionic bonding", detail: "metal plus non-metal" });
    expect(matchesQuery(card, "bonding ionic")).toBe(true);
    expect(matchesQuery(card, "ionic metal")).toBe(true);
    expect(matchesQuery(card, "ionic covalent")).toBe(false);
  });

  it("searches the answer and the subject too, not only the title", () => {
    expect(matchesQuery(item(), "solute")).toBe(true);
    expect(matchesQuery(item(), "biology")).toBe(true);
  });

  it("an empty search matches everything", () => {
    expect(matchesQuery(item(), "")).toBe(true);
    expect(matchesQuery(item(), "   ")).toBe(true);
  });
});

describe("sortItems", () => {
  const a = item({ id: "a", title: "Zebra", createdAt: new Date(2026, 8, 1) });
  const b = item({ id: "b", title: "Ähnlich", createdAt: new Date(2026, 8, 20) });
  const c = item({ id: "c", title: "Mitosis", createdAt: new Date(2026, 8, 10) });

  it("puts the newest first by default", () => {
    expect(sortItems([a, b, c], "NEWEST").map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("reverses for oldest", () => {
    expect(sortItems([a, b, c], "OLDEST").map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  it("sorts A–Z with ä beside a, not after z", () => {
    expect(sortItems([a, b, c], "TITLE").map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate what it was given", () => {
    const input = [a, b, c];
    sortItems(input, "TITLE");
    expect(input.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

describe("countsByType", () => {
  it("counts each kind and the total", () => {
    const counts = countsByType([
      item({ type: "FLASHCARD" }),
      item({ type: "FLASHCARD" }),
      item({ type: "NOTE" }),
      item({ type: "RECORDING" }),
    ]);
    expect(counts).toEqual({ ALL: 4, FLASHCARD: 2, NOTE: 1, RECORDING: 1 });
  });

  it("is all zeros for an empty library, not undefined", () => {
    expect(countsByType([])).toEqual({ ALL: 0, FLASHCARD: 0, NOTE: 0, RECORDING: 0 });
  });
});

describe("filterLibrary", () => {
  const cards = [
    item({ id: "f1", type: "FLASHCARD", title: "Osmosis", createdAt: new Date(2026, 8, 20) }),
    item({ id: "f2", type: "FLASHCARD", title: "Mitosis", folderId: "bio", createdAt: new Date(2026, 8, 18) }),
    item({ id: "n1", type: "NOTE", title: "Lab write-up", folderId: "bio", createdAt: new Date(2026, 8, 19) }),
    item({ id: "r1", type: "RECORDING", title: "Enzymes lesson", createdAt: new Date(2026, 8, 17) }),
  ];

  it("returns everything, newest first, with nothing set", () => {
    const result = filterLibrary(cards, { query: "", type: "ALL", sort: "NEWEST", folderId: null });
    expect(result.items.map((i) => i.id)).toEqual(["f1", "n1", "f2", "r1"]);
    expect(result.total).toBe(4);
  });

  it("narrows to one type without changing the tab counts", () => {
    // The counts are what the OTHER tabs would show. If they were computed
    // after the type filter, every tab but the open one would read 0 — a tab
    // saying nothing is there while its list is full.
    const result = filterLibrary(cards, { query: "", type: "FLASHCARD", sort: "NEWEST", folderId: null });
    expect(result.items.map((i) => i.id)).toEqual(["f1", "f2"]);
    expect(result.counts).toEqual({ ALL: 4, FLASHCARD: 2, NOTE: 1, RECORDING: 1 });
  });

  it("narrows to a folder, and the counts follow the folder", () => {
    const result = filterLibrary(cards, { query: "", type: "ALL", sort: "NEWEST", folderId: "bio" });
    expect(result.items.map((i) => i.id)).toEqual(["n1", "f2"]);
    expect(result.counts).toEqual({ ALL: 2, FLASHCARD: 1, NOTE: 1, RECORDING: 0 });
  });

  it("finds the things in no folder at all", () => {
    const result = filterLibrary(cards, { query: "", type: "ALL", sort: "NEWEST", folderId: "UNFILED" });
    expect(result.items.map((i) => i.id)).toEqual(["f1", "r1"]);
  });

  it("applies the search before counting, so the tabs match the results", () => {
    const result = filterLibrary(cards, { query: "osis", type: "ALL", sort: "NEWEST", folderId: null });
    expect(result.items.map((i) => i.id)).toEqual(["f1", "f2"]);
    expect(result.counts.ALL).toBe(2);
    expect(result.counts.RECORDING).toBe(0);
  });

  it("combines search, folder and type", () => {
    const result = filterLibrary(cards, { query: "mitosis", type: "FLASHCARD", sort: "NEWEST", folderId: "bio" });
    expect(result.items.map((i) => i.id)).toEqual(["f2"]);
  });
});

describe("the query-string parsers", () => {
  it("fall back rather than trusting whatever is in the URL", () => {
    expect(parseType("FLASHCARD")).toBe("FLASHCARD");
    expect(parseType("banana")).toBe("ALL");
    expect(parseType(undefined)).toBe("ALL");

    expect(parseSort("TITLE")).toBe("TITLE");
    expect(parseSort("<script>")).toBe("NEWEST");

    expect(parseView("LIST")).toBe("LIST");
    expect(parseView("anything else")).toBe("GRID");
  });
});

describe("parseFolderName", () => {
  it("takes a name in your own words and tidies the spacing", () => {
    expect(parseFolderName("  Biologie   IGCSE ")).toEqual({ ok: true, name: "Biologie IGCSE" });
  });

  it("refuses an empty name with a sentence, not a code", () => {
    const refusal = parseFolderName("   ");
    expect(refusal.ok).toBe(false);
    if (!refusal.ok) expect(refusal.error).toMatch(/name/i);
  });

  it("refuses one longer than the field is meant to hold", () => {
    expect(parseFolderName("x".repeat(MAX_FOLDER_NAME)).ok).toBe(true);
    expect(parseFolderName("x".repeat(MAX_FOLDER_NAME + 1)).ok).toBe(false);
  });
});

describe("splitLibraryItemId", () => {
  it("reads back each of the four kinds of id", () => {
    expect(splitLibraryItemId("flashcard-abc123")).toEqual({ table: "flashcard", id: "abc123" });
    expect(splitLibraryItemId("note-abc123")).toEqual({ table: "note", id: "abc123" });
    expect(splitLibraryItemId("log-abc123")).toEqual({ table: "log", id: "abc123" });
    expect(splitLibraryItemId("recording-abc123")).toEqual({ table: "recording", id: "abc123" });
  });

  it("refuses anything it does not recognise, because the table name picks what gets written", () => {
    expect(splitLibraryItemId("user-abc123")).toBeNull();
    expect(splitLibraryItemId("flashcard-")).toBeNull();
    expect(splitLibraryItemId("abc123")).toBeNull();
    expect(splitLibraryItemId("")).toBeNull();
    // A cuid is letters, digits, hyphen and underscore. Anything else in the
    // id half is refused rather than passed to the database.
    expect(splitLibraryItemId("flashcard-abc/../def")).toBeNull();
    expect(splitLibraryItemId("flashcard-abc def")).toBeNull();
    expect(splitLibraryItemId("flashcard-a'; DROP TABLE")).toBeNull();
  });

  it("keeps the whole id when the id itself contains a hyphen", () => {
    expect(splitLibraryItemId("flashcard-abc-def")).toEqual({ table: "flashcard", id: "abc-def" });
  });
});
