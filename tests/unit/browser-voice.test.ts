import { describe, it, expect } from "vitest";
import {
  pickVoicePair,
  voiceForSpeaker,
  speechChunks,
  speechShape,
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

describe("speaking it in pieces", () => {
  it("breaks a reply where a person would draw breath", () => {
    const chunks = speechChunks(
      "Right, so osmosis is water moving. It goes from high water potential to low. That is all it is. Does that match what your notes say?",
      60
    );
    expect(chunks.length).toBeGreaterThan(1);
    // Nothing is lost and nothing is duplicated.
    expect(chunks.join(" ")).toBe(
      "Right, so osmosis is water moving. It goes from high water potential to low. That is all it is. Does that match what your notes say?"
    );
    // And every piece ends where a sentence ends.
    for (const chunk of chunks) expect(chunk).toMatch(/[.!?…]$/);
  });

  it("groups short sentences rather than pausing after every four words", () => {
    // A pause after each of these would sound like someone reading a list.
    const chunks = speechChunks("Yes. Exactly. That is the one.", 220);
    expect(chunks).toEqual(["Yes. Exactly. That is the one."]);
  });

  it("breathes at a comma when one sentence runs very long", () => {
    const long = `In economics, ${"a long clause about elasticity, ".repeat(12)}and that is the idea.`;
    const chunks = speechChunks(long, 80);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.join(" ")).toBe(long);
  });

  it("says nothing at all for nothing at all", () => {
    expect(speechChunks("   ")).toEqual([]);
  });
});

describe("how it is said", () => {
  it("pushes a good voice slightly, the way someone talking sounds", () => {
    const shape = speechShape({ name: "Google UK English Female", lang: "en-GB" });
    expect(shape.rate).toBeGreaterThan(1);
    expect(shape.pitch).toBeGreaterThan(1);
    // Not so far that it stops being understandable to someone revising.
    expect(shape.rate).toBeLessThan(1.15);
    expect(shape.pitch).toBeLessThan(1.15);
  });

  it("leaves an old robotic voice alone, because pushing it distorts", () => {
    expect(speechShape({ name: "Daniel Compact", lang: "en-GB" })).toEqual({ rate: 1, pitch: 1 });
    expect(speechShape(null)).toEqual({ rate: 1, pitch: 1 });
  });
});

describe("two voices for an episode", () => {
  const device = [
    { name: "Google UK English Female", lang: "en-GB", localService: false },
    { name: "Google UK English Male", lang: "en-GB", localService: false },
    { name: "Daniel", lang: "en-GB", localService: true },
    { name: "Google Deutsch", lang: "de-DE", localService: false },
  ];

  it("picks two different voices of the same language", () => {
    const pair = pickVoicePair(device, "en");
    expect(pair.a).not.toBeNull();
    expect(pair.b).not.toBeNull();
    expect(pair.b!.name).not.toBe(pair.a!.name);
    // Both still English: a German second voice would be worse than one.
    expect(pair.a!.lang).toContain("en");
    expect(pair.b!.lang).toContain("en");
  });

  it("gives each speaker their own half of the pair", () => {
    const a = voiceForSpeaker("A", device, "what happens to revenue when the price falls");
    const b = voiceForSpeaker("B", device, "what happens to revenue when the price falls");
    expect(a.voice!.name).not.toBe(b.voice!.name);
  });

  it("makes a second person out of one voice when the device has only one", () => {
    const only = [{ name: "Google UK English Female", lang: "en-GB", localService: false }];
    const a = voiceForSpeaker("A", only, "hello there, what is going on");
    const b = voiceForSpeaker("B", only, "hello there, what is going on");
    expect(b.voice!.name).toBe(a.voice!.name);
    // Same voice, shifted — still unmistakably somebody else.
    expect(b.pitch).toBeGreaterThan(a.pitch);
    expect(b.rate).toBeLessThan(a.rate);
  });

  it("decides the language from the whole script, not from one line", () => {
    // "Genau." is four characters and could be anything; the episode it
    // belongs to is plainly German.
    const german = "Also, was passiert mit dem Umsatz, wenn der Preis sinkt? Das kommt darauf an.";
    expect(voiceForSpeaker("B", device, german).lang).toContain("de");
  });
});
