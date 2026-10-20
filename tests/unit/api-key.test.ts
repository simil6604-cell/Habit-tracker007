import { describe, it, expect } from "vitest";
import { inspectApiKey, aiFailureMessage } from "@/lib/ai/api-key";

const GOOD = "sk-ant-api03-AbCdEf0123456789_-xyz";

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
    const key = "sk-ant-аpi03-rest";
    const result = inspectApiKey(key);
    expect(result).not.toBeNull();
    expect(result!.problem).toMatch(/Cyrillic/);
    // Counted from 1 for a human, and the SDK's own "index 7" is position 8.
    expect(result!.problem).toContain("position 8");
    expect(result!.fix).toMatch(/console\.anthropic\.com/);
  });

  it("tells you to copy rather than retype, because retyping is how this happens", () => {
    const result = inspectApiKey("sk-ant-аpi03");
    expect(result!.fix).toMatch(/without retyping/i);
  });

  it("names the other lookalikes it can recognise", () => {
    expect(inspectApiKey("sk-ant-αpi")!.problem).toMatch(/Greek/);
    expect(inspectApiKey("sk—ant-api")!.problem).toMatch(/long dash/);
    expect(inspectApiKey("sk-ant-“api”")!.problem).toMatch(/curly quote/);
    expect(inspectApiKey("sk-ant api")!.problem).toMatch(/invisible space/);
  });

  it("still says something useful for a character it has no name for", () => {
    const result = inspectApiKey("sk-ant-api中");
    expect(result).not.toBeNull();
    expect(result!.problem).toMatch(/not a plain letter/);
  });

  it("reports the first bad character, not the last", () => {
    const result = inspectApiKey("sk-аnt-аpi");
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
    expect(inspectApiKey("sk-ant-api'03")).toBeNull();
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
  const CYRILLIC = "sk-ant-аpi03";

  it("names the key problem and does not invite a retry that cannot work", () => {
    const message = aiFailureMessage(new Error("Cannot convert argument to a ByteString"), CYRILLIC);
    expect(message).toMatch(/Cyrillic/);
    expect(message).toMatch(/console\.anthropic\.com/);
    expect(message).not.toMatch(/try again/i);
  });

  it("keeps the retry wording for a failure that really might pass next time", () => {
    const message = aiFailureMessage(new Error("socket hang up"), "sk-ant-api03-fine");
    expect(message).toMatch(/try again in a moment/);
    expect(message).toContain("socket hang up");
  });

  it("says something for a thrown value that is not an Error", () => {
    expect(aiFailureMessage("nope", "sk-ant-api03-fine")).toContain("unknown error");
  });

  it("prefers the key problem over whatever the call happened to throw", () => {
    // The SDK's own message is about ByteStrings and index numbers. The key
    // problem is the thing the person can act on.
    const message = aiFailureMessage(new Error("index 7 has a value of 1072"), CYRILLIC);
    expect(message).not.toContain("1072");
  });
});
