import { describe, expect, it } from "vitest";
import {
  DRILL_CUES,
  DRILL_VIDEOS,
  FOOTBALL_SKILLS,
  MAX_DRILL_VIDEOS_PER_SKILL,
  POSITION_FOCUS,
  capDrillVideos,
  drillVideoRejection,
  drillSearchUrl,
  suggestedDrillVideos,
} from "@/lib/data/football";
import { toYouTubeEmbed } from "@/lib/utils/video";

describe("drill library coverage", () => {
  // Agility was in the skill list with neither a cue nor a video, so selecting
  // it printed "💡 undefined" — the gap was invisible until someone tapped it.
  it.each(FOOTBALL_SKILLS)("%s has a coaching cue", (skill) => {
    expect(DRILL_CUES[skill], skill).toBeTruthy();
  });

  // The training generator names drills from POSITION_FOCUS, and the training
  // list looks each one up in the same two tables.
  it.each([...new Set(Object.values(POSITION_FOCUS).flat())])("%s, used by the generator, has a cue", (skill) => {
    expect(DRILL_CUES[skill], skill).toBeTruthy();
  });

  it("never suggests more videos than the panel promises", () => {
    for (const skill of Object.keys(DRILL_VIDEOS)) {
      expect(suggestedDrillVideos(skill).length, skill).toBeLessThanOrEqual(MAX_DRILL_VIDEOS_PER_SKILL);
    }
  });

  // The loop above passes with the cap deleted, because nothing in the table
  // exceeds it today. This is the one that actually tests the cap.
  it("cuts a longer list down to the limit", () => {
    expect(capDrillVideos(["a", "b", "c", "d", "e"])).toEqual(["a", "b", "c"]);
    expect(capDrillVideos(["a"])).toEqual(["a"]);
    expect(capDrillVideos([])).toEqual([]);
  });

  it("returns nothing, rather than undefined, for a skill with no suggestion", () => {
    expect(suggestedDrillVideos("Agility")).toEqual([]);
    expect(suggestedDrillVideos("not a skill")).toEqual([]);
  });

  // Every suggested link has to survive the same parsing the iframe src is
  // built from — a link that can't be embedded silently degrades to a bare
  // "Saved reference ↗" where a video was promised.
  it("suggests only links that really embed as YouTube videos", () => {
    for (const [skill, urls] of Object.entries(DRILL_VIDEOS)) {
      for (const url of urls) {
        expect(toYouTubeEmbed(url), `${skill}: ${url}`).toMatch(/^https:\/\/www\.youtube\.com\/embed\//);
      }
    }
  });

  it("never lists the same video twice for one skill", () => {
    for (const [skill, urls] of Object.entries(DRILL_VIDEOS)) {
      expect(new Set(urls).size, skill).toBe(urls.length);
    }
  });
});

describe("drillSearchUrl", () => {
  // This is what a skill with no suggested video offers instead. Inventing an
  // eleven-character YouTube id isn't a broken link you can spot — it plays a
  // different video — so a search is the honest fallback.
  it("builds a real YouTube search for the skill", () => {
    const url = new URL(drillSearchUrl("Agility"));
    expect(url.origin).toBe("https://www.youtube.com");
    expect(url.pathname).toBe("/results");
    expect(url.searchParams.get("search_query")).toBe("football Agility drills training");
  });

  it("escapes a skill name rather than splicing it into the query", () => {
    const url = new URL(drillSearchUrl("First Touch"));
    expect(url.searchParams.get("search_query")).toBe("football First Touch drills training");
    expect(drillSearchUrl("First Touch")).not.toContain(" ");
  });

  it("offers a search for every skill, including the ones with no video", () => {
    for (const skill of FOOTBALL_SKILLS) {
      expect(() => new URL(drillSearchUrl(skill)), skill).not.toThrow();
    }
  });
});

describe("drillVideoRejection", () => {
  const a = "https://www.youtube.com/watch?v=aaaaaaaaaaa";
  const b = "https://www.youtube.com/watch?v=bbbbbbbbbbb";
  const c = "https://www.youtube.com/watch?v=ccccccccccc";
  const d = "https://www.youtube.com/watch?v=ddddddddddd";

  it("lets the first one through", () => {
    expect(drillVideoRejection([], a)).toBeNull();
  });

  it("fills the skill up to the limit", () => {
    expect(drillVideoRejection([a], b)).toBeNull();
    expect(drillVideoRejection([a, b], c)).toBeNull();
  });

  // An end-to-end test that saves one video never reaches this, so the cap
  // lives or dies by this case.
  it("refuses the one past the limit, and says how to make room", () => {
    const reason = drillVideoRejection([a, b, c], d);
    expect(reason).toMatch(new RegExp(`${MAX_DRILL_VIDEOS_PER_SKILL}`));
    expect(reason).toMatch(/remove one first/);
  });

  it("refuses a duplicate rather than showing the same video twice", () => {
    expect(drillVideoRejection([a, b], a)).toMatch(/already saved/);
  });
});
