import { describe, expect, it } from "vitest";
import {
  plannedFolders,
  plannedSections,
  STARTER_FOLDERS,
  STARTER_SECTIONS,
} from "@/lib/library/starter-structure";

describe("the five subject folders", () => {
  it("is the five that were asked for", () => {
    expect([...STARTER_FOLDERS]).toEqual(["Economics", "Biology", "Mathematics", "English", "German"]);
  });

  it("creates all five on an empty library", () => {
    const { create, keep } = plannedFolders([]);
    expect(create).toEqual([...STARTER_FOLDERS]);
    expect(keep).toEqual([]);
  });

  it("leaves a folder that already exists alone", () => {
    const { create, keep } = plannedFolders(["Biology"]);
    expect(keep).toEqual(["Biology"]);
    expect(create).not.toContain("Biology");
    expect(create).toHaveLength(4);
  });

  it("does not make a second folder in different capitals", () => {
    // SQLite's own uniqueness is case-sensitive, so without this the student
    // ends up with "economics" and "Economics" side by side.
    const { create, keep } = plannedFolders(["economics", "  BIOLOGY "]);
    expect(keep).toEqual(expect.arrayContaining(["Economics", "Biology"]));
    expect(create).toEqual(["Mathematics", "English", "German"]);
  });

  it("leaves folders of their own untouched", () => {
    const { create } = plannedFolders(["Zusatz", "Photography"]);
    expect(create).toEqual([...STARTER_FOLDERS]);
  });
});

describe("the sections inside a folder", () => {
  it("adds the dividers from the picture", () => {
    expect(plannedSections([])).toEqual([...STARTER_SECTIONS]);
  });

  it("only adds the ones that are missing", () => {
    expect(plannedSections(["Corrections"])).toEqual(["Lesson notes", "Formative assessment"]);
    expect(plannedSections(["lesson notes", "CORRECTIONS", "Formative assessment"])).toEqual([]);
  });
});
