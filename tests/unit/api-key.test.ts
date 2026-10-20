import { describe, it, expect } from "vitest";
import { inspectApiKey, aiFailureMessage, describeKeyShape } from "@/lib/ai/api-key";

// A realistic length. The short stand-in used at first was itself below
// the "this is not a whole key" threshold, which is the tests being
// unrealistic rather than the rule being wrong.
const GOOD = "sk-ant-api03-" + "AbCdEf0123456789_-xyz".repeat(5);

describe("inspectApiKey", () => {
  it("passes a normal key", () => {
    expect(inspectApiKey(GOOD)).toBeNull();
  });

  it("says nothing about a key that is simply not set", () => {
    // Missing is a different problem with a different fix, and the health
    // check already has words for it.
    expect(inspectApiKey("")).toBeNull();
    expect(inspectApiKey(undefined)).toBeNull();
    expect(inspectApiKey(null)).toBeNull();
  });

  it("catches the Cyrillic lookalike that caused this", () => {
    // The real failure: a Cyrillic а (U+0430) where the Latin a of
    // "sk-ant-api03" belongs. Identical on screen, impossible in a header.
    const key = "sk-ant-аpi03-rest" + "x".repeat(90);
    const result = inspectApiKey(key);
    expect(result).not.toBeNull();
    expect(result!.problem).toMatch(/Cyrillic/);
    // Counted from 1 for a human, and the SDK's own "index 7" is position 8.
    expect(result!.problem).toContain("position 8");
    expect(result!.fix).toMatch(/console\.anthropic\.com/);
  });

  it("tells you to copy rather than retype, because retyping is how this happens", () => {
    const result = inspectApiKey("sk-ant-аpi03" + "x".repeat(90));
    expect(result!.fix).toMatch(/without retyping/i);
  });

  it("names the other lookalikes it can recognise", () => {
    expect(inspectApiKey("sk-ant-αpi" + "x".repeat(90))!.problem).toMatch(/Greek/);
    expect(inspectApiKey("sk—ant-api" + "x".repeat(90))!.problem).toMatch(/long dash/);
    expect(inspectApiKey("sk-ant-“api”" + "x".repeat(90))!.problem).toMatch(/curly quote/);
    expect(inspectApiKey("sk-ant api" + "x".repeat(90))!.problem).toMatch(/invisible space/);
  });

  it("still says something useful for a character it has no name for", () => {
    const result = inspectApiKey("sk-ant-api中" + "x".repeat(90));
    expect(result).not.toBeNull();
    expect(result!.problem).toMatch(/not a plain letter/);
  });

  it("reports the first bad character, not the last", () => {
    const result = inspectApiKey("sk-аnt-аpi" + "x".repeat(90));
    expect(result!.problem).toContain("position 4");
  });

  it("catches whitespace around the value", () => {
    expect(inspectApiKey(` ${GOOD}`)!.problem).toMatch(/space or line break/);
    expect(inspectApiKey(`${GOOD}\n`)!.problem).toMatch(/space or line break/);
  });

  it("catches quotes kept as part of the value", () => {
    // Render and .env files both do this when the value is pasted with them.
    expect(inspectApiKey(`"${GOOD}"`)!.problem).toMatch(/quotation marks/);
    expect(inspectApiKey(`'${GOOD}'`)!.problem).toMatch(/quotation marks/);
  });

  it("does not flag an apostrophe that is part of a key", () => {
    // Only a matched pair wrapping the whole value is a quoting mistake.
    expect(inspectApiKey("sk-ant-api'03" + "x".repeat(90))).toBeNull();
  });

  it("checks whitespace before the character, because trimming can reveal one", () => {
    const result = inspectApiKey(" sk-ant-аpi ");
    expect(result!.problem).toMatch(/space or line break/);
  });

  it("accepts every character a real key is made of", () => {
    expect(inspectApiKey("sk-ant-api03-" + "aZ09_-".repeat(16))).toBeNull();
  });
});

describe("aiFailureMessage", () => {
  const CYRILLIC = "sk-ant-аpi03" + "x".repeat(90);

  it("names the key problem and does not invite a retry that cannot work", () => {
    const message = aiFailureMessage(new Error("Cannot convert argument to a ByteString"), CYRILLIC);
    expect(message).toMatch(/Cyrillic/);
    expect(message).toMatch(/console\.anthropic\.com/);
    expect(message).not.toMatch(/try again/i);
  });

  it("keeps the retry wording for a failure that really might pass next time", () => {
    const message = aiFailureMessage(new Error("socket hang up"), GOOD);
    expect(message).toMatch(/try again in a moment/);
    expect(message).toContain("socket hang up");
  });

  it("says something for a thrown value that is not an Error", () => {
    expect(aiFailureMessage("nope", GOOD)).toContain("unknown error");
  });

  it("prefers the key problem over whatever the call happened to throw", () => {
    // The SDK's own message is about ByteStrings and index numbers. The key
    // problem is the thing the person can act on.
    const message = aiFailureMessage(new Error("index 7 has a value of 1072"), CYRILLIC);
    expect(message).not.toContain("1072");
  });
});

describe("a space inside the key", () => {
  it("is caught, because it survives trimming and reads as a flat 401", () => {
    const result = inspectApiKey("sk-ant-api03 " + "x".repeat(90));
    expect(result).not.toBeNull();
    expect(result!.problem).toMatch(/space inside it/);
    expect(result!.fix).toMatch(/in one go/);
  });

  it("is caught wherever it is", () => {
    expect(inspectApiKey("sk-ant-api03-abc def" + "x".repeat(90))).not.toBeNull();
    expect(inspectApiKey("sk ant-api03-abc" + "x".repeat(90))).not.toBeNull();
  });

  it("still reports surrounding whitespace as surrounding whitespace", () => {
    // Different cause, different fix — "copy it in one go" is wrong advice
    // for a value that is simply padded.
    expect(inspectApiKey(" sk-ant-api03-abc ")!.problem).toMatch(/space or line break/);
  });
});

describe("describeKeyShape", () => {
  it("gives the length and the public prefix, and nothing more", () => {
    const key = "sk-ant-api03-" + "x".repeat(90);
    const shape = describeKeyShape(key);
    expect(shape).toContain("103 characters");
    expect(shape).toContain('starts "sk-ant-"');
    // The secret part never appears.
    expect(shape).not.toContain("x".repeat(20));
  });

  it("says what a complete key looks like, so a truncated one is obvious", () => {
    expect(describeKeyShape("sk-ant-api03-short")).toMatch(/about 100 characters/);
  });

  it("copes with no key at all", () => {
    expect(describeKeyShape("")).toBe("no key is set");
    expect(describeKeyShape(undefined)).toBe("no key is set");
    expect(describeKeyShape("   ")).toBe("no key is set");
  });
});

describe("naming the exact whitespace", () => {
  it("calls a non-breaking space invisible rather than just a space", () => {
    // It matters: told "there is a space in it", you look at the value, see
    // no space, and conclude the app is wrong.
    expect(inspectApiKey("sk-ant api03" + "x".repeat(90))!.problem).toMatch(/invisible space/);
  });

  it("calls a line break a line break", () => {
    expect(inspectApiKey("sk-ant-\napi03" + "x".repeat(90))!.problem).toMatch(/line break/);
    expect(inspectApiKey("sk-ant-\tapi03" + "x".repeat(90))!.problem).toMatch(/tab/);
  });

  it("calls an ordinary space a space", () => {
    expect(inspectApiKey("sk-ant-api03 rest" + "x".repeat(90))!.problem).toMatch(/space inside it/);
  });
});

describe("the abbreviated key from the console list", () => {
  it("catches the exact thing that was pasted: 21 characters ending in the preview", () => {
    // Reported from a real deployment — "set — 21 characters, starts
    // sk-ant-…, ends …HgAA". That is the shortened form the console shows in
    // its LIST of keys, which looks and copies exactly like a key.
    const result = inspectApiKey("sk-ant-api03-abcHgAA");
    expect(result).not.toBeNull();
    expect(result!.problem).toMatch(/only 20 characters/);
    expect(result!.problem).toMatch(/list of keys/);
    expect(result!.fix).toMatch(/shown once/);
    expect(result!.fix).toMatch(/copy button/);
  });

  it("says where the real one comes from, not just that this is wrong", () => {
    expect(inspectApiKey("sk-ant-short")!.fix).toMatch(/Create key/);
  });

  it("does not refuse a key of a normal length", () => {
    expect(inspectApiKey("sk-ant-api03-" + "x".repeat(95))).toBeNull();
  });

  it("leaves room for a format change rather than pinning the exact length", () => {
    // A key must be clearly short to be refused — 60 characters is unusual
    // but not something this should reject on its own guess.
    expect(inspectApiKey("sk-ant-" + "x".repeat(53))).toBeNull();
  });

  it("explains the length before complaining about a character in it", () => {
    // A twenty-character string has a much more specific explanation than
    // whatever sits at position 9 of it.
    const result = inspectApiKey("sk-ant-аbc");
    expect(result!.problem).toMatch(/only \d+ characters/);
  });
});
