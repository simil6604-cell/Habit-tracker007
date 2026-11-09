import { describe, it, expect } from "vitest";
import {
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
    expect(defaultDictationLang("de-CH")).toBe("de-CH");
    expect(defaultDictationLang("de-DE")).toBe("de-DE");
    expect(defaultDictationLang("en-GB")).toBe("en-GB");
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
    expect(parseDictationLang("kl-KL", "de-CH")).toBe("de-CH");
    expect(parseDictationLang(null, "de-CH")).toBe("de-CH");
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
