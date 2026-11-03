import { describe, expect, it } from "vitest";
import { chatLabel, cleanChatTitle, derivedChatTitle, MAX_CHAT_TITLE } from "@/lib/school/chat-titles";

describe("cleanChatTitle", () => {
  it("keeps what was typed, tidied", () => {
    expect(cleanChatTitle("  Moles   and  ratios ")).toBe("Moles and ratios");
  });

  it("treats an emptied box as taking the name off again", () => {
    expect(cleanChatTitle("")).toBeNull();
    expect(cleanChatTitle("    ")).toBeNull();
  });

  it("will not let one row swallow the list", () => {
    expect(cleanChatTitle("x".repeat(500))).toHaveLength(MAX_CHAT_TITLE);
  });
});

describe("derivedChatTitle", () => {
  it("names a conversation after what was first asked", () => {
    expect(derivedChatTitle("What is a mole ratio?")).toBe("What is a mole ratio?");
  });

  it("cuts long questions at a word, not mid-word", () => {
    const title = derivedChatTitle(
      "Can you explain how to work out the empirical formula from percentage composition?"
    );
    expect(title).toBe("Can you explain how to work out the…");
    expect(title!.length).toBeLessThanOrEqual(41);
  });

  it("does not name a conversation after a photo placeholder", () => {
    // What the app stores when pictures are sent with no words. As a title
    // it says nothing about what the conversation was.
    expect(derivedChatTitle("(sent photos without a question)")).toBeNull();
  });

  it("strips markdown rather than putting asterisks in the list", () => {
    expect(derivedChatTitle("**Explain** the `nucleus`")).toBe("Explain the nucleus");
  });

  it("has no name for nothing", () => {
    expect(derivedChatTitle("")).toBeNull();
    expect(derivedChatTitle(null)).toBeNull();
    expect(derivedChatTitle("   ")).toBeNull();
  });
});

describe("chatLabel", () => {
  it("prefers the name the student wrote", () => {
    // The whole point of the request: the titles are theirs.
    expect(chatLabel({ title: "Chemistry revision", firstQuestion: "What is a mole?" })).toBe("Chemistry revision");
  });

  it("falls back to the question, then to something honest", () => {
    expect(chatLabel({ title: null, firstQuestion: "What is a mole?" })).toBe("What is a mole?");
    expect(chatLabel({ title: "   ", firstQuestion: null })).toBe("New chat");
    expect(chatLabel({ title: null })).toBe("New chat");
  });
});
