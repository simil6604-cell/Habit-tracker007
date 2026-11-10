import { describe, it, expect } from "vitest";
import {
  mismatchedLang,
  DEFAULT_DICTATION_LANG,
  DICTATION_LANGS,
  defaultDictationLang,
  dictationLabel,
  isDictationLang,
  parseDictationLang,
} from "@/lib/ai/voice/dictation-lang";

describe("which language dictation listens in", () => {
  it("starts from the device, because that is the better guess", () => {
    // The Web Speech API does not detect the language — it is told one, and
    // forces everything it hears through that model. Someone whose phone is
    // in German is more likely than not to dictate in German.
    expect(defaultDictationLang("de-DE")).toBe("de-DE");
    expect(defaultDictationLang("en-GB")).toBe("en-GB");
  });

  it("gives a Swiss phone Standard German, not Swiss German", () => {
    // Swiss German is a different spoken language, not a regional spelling
    // of the same one, and this student dictates Hochdeutsch about school.
    // Forced through the Swiss model, every sentence comes back slightly
    // wrong while the settings look perfectly correct — which is what "it
    // doesn't listen properly" turns out to be.
    expect(defaultDictationLang("de-CH")).toBe("de-DE");
    // Still offered, for someone who really does speak it.
    expect(parseDictationLang("de-CH", "en-GB")).toBe("de-CH");
  });

  it("falls back to the same language in another country before giving up", () => {
    expect(defaultDictationLang("de-AT")).toBe("de-DE");
    expect(defaultDictationLang("en-US")).toBe("en-GB");
  });

  it("falls back to English for a language this app has no option for", () => {
    expect(defaultDictationLang("fr-FR")).toBe(DEFAULT_DICTATION_LANG);
    expect(defaultDictationLang(null)).toBe(DEFAULT_DICTATION_LANG);
    expect(defaultDictationLang("")).toBe(DEFAULT_DICTATION_LANG);
  });

  it("remembers a choice, and ignores one that is no longer an option", () => {
    expect(parseDictationLang("de-DE", "en-GB")).toBe("de-DE");
    expect(parseDictationLang("kl-KL", "de-CH")).toBe("de-DE");
    expect(parseDictationLang(null, "de-CH")).toBe("de-DE");
    expect(parseDictationLang(42, null)).toBe(DEFAULT_DICTATION_LANG);
  });

  it("only accepts the codes it actually offers", () => {
    for (const lang of DICTATION_LANGS) expect(isDictationLang(lang.code)).toBe(true);
    expect(isDictationLang("de")).toBe(false);
    expect(isDictationLang("")).toBe(false);
  });

  it("has a short label for each, for a button that sits beside the mic", () => {
    expect(dictationLabel("de-CH")).toBe("DE-CH");
    expect(dictationLabel("en-GB")).toBe("EN");
    expect(dictationLabel("nonsense")).toBe("nonsense");
  });
});

describe("hearing the wrong language", () => {
  it("spots a German sentence coming back from an English recogniser", () => {
    const wrong = mismatchedLang("ich verstehe das mit der Osmose nicht", "en-GB");
    expect(wrong?.base).toBe("de");
    // de-DE rather than de-CH: the one that is offered has to be the one
    // most people mean when they say German.
    expect(wrong?.code).toBe("de-DE");
  });

  it("spots an English sentence coming back from a German recogniser", () => {
    expect(mismatchedLang("can you explain what osmosis is to me", "de-DE")?.code).toBe("en-GB");
    expect(mismatchedLang("can you explain what osmosis is to me", "de-CH")?.code).toBe("en-GB");
  });

  it("says nothing when the language is the one being listened in", () => {
    expect(mismatchedLang("ich verstehe das nicht so ganz", "de-DE")).toBeNull();
    expect(mismatchedLang("can you explain this to me again", "en-GB")).toBeNull();
  });

  it("says nothing about a few words, which are not evidence of anything", () => {
    // "Okay" and "ja" are both languages. An offer that appears constantly
    // is an offer nobody reads.
    expect(mismatchedLang("ja", "en-GB")).toBeNull();
    expect(mismatchedLang("okay danke", "en-GB")).toBeNull();
  });

  it("says nothing when the words carry no language at all", () => {
    // A formula or a list of numbers must not be read as English just
    // because English is the fallback everywhere else.
    expect(mismatchedLang("3 5 7 11 13 17", "de-DE")).toBeNull();
    // Nor a line of maths read out: "x squared plus y squared" has no
    // marker word in it either, and staying quiet is the right answer.
    expect(mismatchedLang("x squared plus y squared", "de-DE")).toBeNull();
    // One ordinary English clause in it, and it speaks up.
    expect(mismatchedLang("what is x squared plus y squared", "de-DE")?.code).toBe("en-GB");
  });

  it("says nothing when it is not listening in a language it knows", () => {
    expect(mismatchedLang("ich verstehe das mit der Osmose nicht", "fr-FR")).toBeNull();
  });
});
