import { describe, expect, it } from "vitest";
import { collectImages } from "@/lib/ai/anthropic-provider";
import { MAX_PHOTOS_PER_MESSAGE, ownedUploadPaths, parseImagePaths, visionMediaType } from "@/lib/school/school-ai-photos";
import { buildSchoolAIPrompt, type SchoolAITurn } from "@/lib/school/school-ai";

describe("collectImages", () => {
  // A dozen call sites still pass one image the old way. If this regresses,
  // note summaries and meal photos stop reaching the model — and the failure
  // is silent, because a reply still comes back, just about nothing.
  it("still carries the single-image form", () => {
    expect(collectImages({ imageBase64: "AAA", imageMediaType: "image/png" })).toEqual([
      { base64: "AAA", mediaType: "image/png" },
    ]);
  });

  it("defaults an unknown media type to jpeg rather than sending it on", () => {
    expect(collectImages({ imageBase64: "AAA", imageMediaType: "image/heic" })).toEqual([
      { base64: "AAA", mediaType: "image/jpeg" },
    ]);
  });

  it("carries a whole batch, in the order given", () => {
    const images = collectImages({
      images: [
        { base64: "one", mediaType: "image/jpeg" },
        { base64: "two", mediaType: "image/webp" },
        { base64: "three", mediaType: "image/png" },
      ],
    });
    expect(images.map((i) => i.base64)).toEqual(["one", "two", "three"]);
    expect(images.map((i) => i.mediaType)).toEqual(["image/jpeg", "image/webp", "image/png"]);
  });

  it("drops entries with no data instead of building a half-formed image block", () => {
    expect(
      collectImages({ images: [{ base64: "" }, null, "nope", { mediaType: "image/png" }, { base64: "good" }] })
    ).toEqual([{ base64: "good", mediaType: "image/jpeg" }]);
  });

  it("reads no images at all out of an empty context", () => {
    expect(collectImages({})).toEqual([]);
    expect(collectImages({ images: "not-an-array" })).toEqual([]);
  });
});

describe("visionMediaType", () => {
  it.each([
    ["image/jpeg", "image/jpeg"],
    ["image/jpg", "image/jpeg"],
    ["IMAGE/PNG", "image/png"],
    ["image/webp", "image/webp"],
    ["image/gif", "image/gif"],
  ])("accepts %s", (input, expected) => {
    expect(visionMediaType(input)).toBe(expected);
  });

  // This is the one that bites: an iPhone saves HEIC by default, the upload
  // succeeds, and the tutor answers about a photo it was never shown.
  it.each(["image/heic", "image/heif", "application/pdf", "", null, undefined])("refuses %s", (input) => {
    expect(visionMediaType(input)).toBeNull();
  });
});

describe("ownedUploadPaths", () => {
  const me = "user_abc123";

  it("keeps this user's own photos", () => {
    expect(ownedUploadPaths([`/uploads/${me}/a1b2.jpg`, `/uploads/${me}/c3d4.png`], me)).toEqual([
      `/uploads/${me}/a1b2.jpg`,
      `/uploads/${me}/c3d4.png`,
    ]);
  });

  it("drops another user's photo, which is the whole point of the check", () => {
    expect(ownedUploadPaths([`/uploads/someone_else/a1b2.jpg`], me)).toEqual([]);
  });

  it.each([
    ["traversal out of the user directory", `/uploads/${me}/../../etc/passwd`],
    ["traversal in the owner segment", `/uploads/../${me}/a1b2.jpg`],
    ["an extra directory level", `/uploads/${me}/sub/a1b2.jpg`],
    ["no /uploads prefix", `/etc/passwd`],
    ["an absolute URL", `https://evil.example/uploads/${me}/a1b2.jpg`],
    ["no extension", `/uploads/${me}/a1b2`],
    ["a filename with a slash-escape", `/uploads/${me}/a%2f..%2fb.jpg`],
  ])("drops %s", (_label, path) => {
    expect(ownedUploadPaths([path], me)).toEqual([]);
  });

  it("drops non-strings and de-duplicates", () => {
    expect(ownedUploadPaths([`/uploads/${me}/a.jpg`, 42, null, `/uploads/${me}/a.jpg`], me)).toEqual([
      `/uploads/${me}/a.jpg`,
    ]);
  });

  it("reads anything that isn't a list as no photos", () => {
    expect(ownedUploadPaths(undefined, me)).toEqual([]);
    expect(ownedUploadPaths(`/uploads/${me}/a.jpg`, me)).toEqual([]);
  });
});

describe("parseImagePaths", () => {
  it("reads back what was stored", () => {
    expect(parseImagePaths(JSON.stringify(["/uploads/u/a.jpg"]))).toEqual(["/uploads/u/a.jpg"]);
  });

  it("treats null, junk and the wrong shape as no photos rather than throwing", () => {
    expect(parseImagePaths(null)).toEqual([]);
    expect(parseImagePaths("not json")).toEqual([]);
    expect(parseImagePaths('{"a":1}')).toEqual([]);
    expect(parseImagePaths('["/uploads/u/a.jpg", 7]')).toEqual(["/uploads/u/a.jpg"]);
  });
});

describe("buildSchoolAIPrompt", () => {
  const turns: SchoolAITurn[] = [
    { role: "USER", content: "Mark this for me", photoCount: 3 },
    { role: "ASSISTANT", content: "You lost a mark on the units.", photoCount: 0 },
  ];

  // Past images aren't re-sent with every request, so if the history didn't say
  // they existed the tutor would read "which one did I get wrong?" as a
  // question about nothing and tell the student they forgot to attach anything.
  it("records how many photos an earlier turn carried", () => {
    const prompt = buildSchoolAIPrompt(turns, "Which one?", 0);
    expect(prompt).toContain("Student [sent 3 photos]: Mark this for me");
    expect(prompt).toContain("Tutor: You lost a mark on the units.");
    expect(prompt).toContain("Student: Which one?");
  });

  it("says one photo in the singular", () => {
    expect(buildSchoolAIPrompt([{ role: "USER", content: "this", photoCount: 1 }], "and?", 0)).toContain(
      "[sent 1 photo]"
    );
  });

  it("points at the images attached to the current turn", () => {
    expect(buildSchoolAIPrompt([], "What's wrong here?", 4)).toContain("4 photos attached to this message");
  });

  it("opens straight with the question when there is no history", () => {
    expect(buildSchoolAIPrompt([], "Explain moles", 0)).toBe("Student: Explain moles");
  });

  it("replays only the last few turns, so the prompt can't grow without bound", () => {
    const many: SchoolAITurn[] = Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 === 0 ? "USER" : "ASSISTANT",
      content: `turn ${i}`,
      photoCount: 0,
    }));
    const prompt = buildSchoolAIPrompt(many, "and now?", 0);
    expect(prompt).not.toContain("turn 0");
    expect(prompt).toContain("turn 39");
  });
});

describe("photo limit", () => {
  it("is a real number the panel and the action both read", () => {
    expect(MAX_PHOTOS_PER_MESSAGE).toBeGreaterThan(1);
  });
});
