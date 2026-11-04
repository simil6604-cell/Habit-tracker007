import { describe, it, expect } from "vitest";
import {
  DEFAULT_LOCALE,
  detectSpokenLang,
  normalizeLang,
  pickVoice,
  voiceFor,
  voiceScore,
  type VoiceLike,
} from "@/lib/ai/voice/browser-voice";

const v = (name: string, lang: string, over: Partial<VoiceLike> = {}): VoiceLike => ({
  name,
  lang,
  localService: true,
  ...over,
});

/** What a German-language phone running Chrome actually reports. */
const GERMAN_PHONE: VoiceLike[] = [
  v("Deutsch Deutschland", "de-DE", { default: true }),
  v("Google Deutsch", "de-DE", { localService: false }),
  v("Google US English", "en-US", { localService: false }),
  v("Google UK English Female", "en-GB", { localService: false }),
];

describe("detectSpokenLang", () => {
  it("reads an English answer as English, on a German phone", () => {
    // The whole bug in one case: the device says de-CH, the sentence is
    // English, and it was being read aloud letter by German letter.
    expect(
      detectSpokenLang("The nucleus holds the DNA and controls what the cell does.", "de-CH")
    ).toBe("en");
  });

  it("reads a German answer as German, on an English phone", () => {
    expect(detectSpokenLang("Der Zellkern enthält die DNA und steuert die Zelle.", "en-GB")).toBe("de");
  });

  it("uses an umlaut as the giveaway it is", () => {
    // Short, and the marker words are no help: "Übung macht den Meister".
    expect(detectSpokenLang("Übung macht den Meister", "en-GB")).toBe("de");
  });

  it("falls back to the device only when the text decides nothing", () => {
    expect(detectSpokenLang("42", "de-CH")).toBe("de");
    expect(detectSpokenLang("42", "en-GB")).toBe("en");
    expect(detectSpokenLang("🙂", null)).toBe("en");
    // A language this app is not used in is not a usable fallback either.
    expect(detectSpokenLang("42", "fr-FR")).toBe("en");
  });

  it("is not fooled by the handful of words both languages share", () => {
    // "in", "so", "was" and "international" are all German words too.
    expect(detectSpokenLang("So what was the result in the test?", "de-CH")).toBe("en");
  });
});

describe("normalizeLang", () => {
  it("takes any shape of the two codes it knows, and refuses the rest", () => {
    expect(normalizeLang("de-CH")).toBe("de");
    expect(normalizeLang("DE")).toBe("de");
    expect(normalizeLang("en-US")).toBe("en");
    expect(normalizeLang("fr")).toBeNull();
    expect(normalizeLang(undefined)).toBeNull();
    expect(normalizeLang("")).toBeNull();
  });
});

describe("voiceScore", () => {
  it("refuses a voice of the wrong language outright", () => {
    // However good it is. A German voice reading English is the thing being
    // fixed, and no amount of "Natural" in its name makes it acceptable.
    expect(voiceScore(v("Microsoft Katja Online (Natural)", "de-DE", { localService: false }), "en")).toBeLessThan(0);
  });

  it("prefers the neural voice over the old robotic one of the same language", () => {
    const natural = v("Microsoft Sonia Online (Natural) - English (United Kingdom)", "en-GB", { localService: false });
    const compact = v("Daniel (Compact)", "en-GB");
    expect(voiceScore(natural, "en")).toBeGreaterThan(voiceScore(compact, "en"));
  });

  it("prefers British English, since that is what is being taught", () => {
    expect(voiceScore(v("Google UK English Female", "en-GB"), "en")).toBeGreaterThan(
      voiceScore(v("Google US English", "en-US"), "en")
    );
  });
});

describe("pickVoice", () => {
  it("picks an English voice for English on a German phone", () => {
    const chosen = pickVoice(GERMAN_PHONE, "en");
    expect(chosen?.name).toBe("Google UK English Female");
  });

  it("picks a German voice for German on that same phone", () => {
    expect(pickVoice(GERMAN_PHONE, "de")?.name).toBe("Google Deutsch");
  });

  it("gives back nothing rather than something of the wrong language", () => {
    // Null is the honest answer: the caller then sets the locale only and
    // lets the browser do what it can, instead of handing it a voice that
    // guarantees the accent.
    expect(pickVoice([v("Deutsch Deutschland", "de-DE")], "en")).toBeNull();
    expect(pickVoice([], "en")).toBeNull();
  });

  it("takes the best English voice there is when there is no good one", () => {
    expect(pickVoice([v("Daniel (Compact)", "en-GB")], "en")?.name).toBe("Daniel (Compact)");
  });

  it("makes the same choice twice, so one reply is not read by two voices", () => {
    const tied = [v("Alpha", "en-GB"), v("Beta", "en-GB")];
    expect(pickVoice(tied, "en")?.name).toBe(pickVoice([...tied], "en")?.name);
  });
});

describe("voiceFor", () => {
  it("hands back the voice and the locale that goes with it", () => {
    const chosen = voiceFor("The mitochondria are the powerhouse of the cell.", GERMAN_PHONE, "de-CH");
    expect(chosen.voice?.name).toBe("Google UK English Female");
    expect(chosen.lang).toBe("en-GB");
  });

  it("asks for the language even when the device has no voice for it", () => {
    const chosen = voiceFor("The nucleus holds the DNA.", [v("Deutsch Deutschland", "de-DE")], "de-CH");
    expect(chosen.voice).toBeNull();
    expect(chosen.lang).toBe(DEFAULT_LOCALE.en);
  });

  it("switches language between two replies in the same conversation", () => {
    const english = voiceFor("What does the nucleus do?", GERMAN_PHONE, "de-CH");
    const german = voiceFor("Der Zellkern steuert die Zelle.", GERMAN_PHONE, "de-CH");
    expect(english.voice?.lang).toBe("en-GB");
    expect(german.voice?.lang).toBe("de-DE");
  });
});
