/**
 * Choosing how the browser's own voice should sound.
 *
 * The browser voice was asked to read every reply in `navigator.language` —
 * the language of the PHONE, not of the sentence. On a German phone that is
 * a German voice reading English out loud, letter by German letter, and it
 * is as bad as it sounds.
 *
 * Two separate things went wrong and both have to be fixed or neither helps:
 * the wrong language was asked for, and no voice was ever chosen. Setting
 * `utterance.lang` alone is a hint most browsers ignore — Chrome and Safari
 * both keep using the system default voice unless `utterance.voice` is set
 * to an actual voice object.
 *
 * Everything here is pure, so the choice can be tested against the voice
 * lists real devices report without a browser.
 */

export type SpokenLang = "en" | "de";

/** A browser voice, as much of it as choosing one needs. */
export type VoiceLike = {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
};

/**
 * Words that only really turn up in one of the two languages.
 *
 * Function words rather than nouns: they are the most common words in any
 * sentence, they are short, and nobody writes a German sentence without
 * "der/die/und/ist" or an English one without "the/and/is/to".
 */
const GERMAN_MARKERS = [
  "der","die","das","und","ist","nicht","ich","du","wir","sie","ihr","mit","auch","noch","sehr","eine","einen",
  "einem","kann","muss","soll","wenn","dann","weil","aber","oder","für","auf","aus","dass","wie","was","hier",
  "schon","mehr","immer","jetzt","beim","vom","zum","zur","dein","mein","sind","hast","habe","wird","werden",
  "über","unter","nach","vor","bei","dem","den","des","es","im","am",
];

const ENGLISH_MARKERS = [
  "the","and","is","are","you","your","to","of","that","this","with","for","it","on","in","we","can","will",
  "what","when","how","why","not","have","has","do","does","about","from","they","their","there","was","were",
  "would","should","could","because","if","then","so","at","as","but","or","an","a","be","by","more","just",
];

/** Letters that are German giveaways; "ö" and "ü" are not English letters. */
const GERMAN_LETTERS = /[äöüßÄÖÜ]/;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Which language a reply is in, decided from the reply itself.
 *
 * Counting marker words rather than asking a model: this runs before every
 * sentence is spoken, it has to be instant, and the only two languages this
 * app is ever used in are far enough apart that counting "der/und/ist"
 * against "the/and/is" settles it.
 *
 * `fallback` is for the genuinely undecidable — a one-word reply, a formula,
 * an emoji. It is better to use the device's language there than to guess,
 * and the device is usually right about the person.
 */
export function detectSpokenLang(text: string, fallback?: string | null): SpokenLang {
  const tokens = words(text);
  let german = 0;
  let english = 0;
  for (const token of tokens) {
    if (GERMAN_MARKERS.includes(token)) german++;
    if (ENGLISH_MARKERS.includes(token)) english++;
  }
  // An umlaut or an ß is worth a few marker words: English simply has none,
  // while plenty of German sentences share short words with English.
  if (GERMAN_LETTERS.test(text)) german += 2;

  if (german > english) return "de";
  if (english > german) return "en";
  return normalizeLang(fallback) ?? "en";
}

/** "de-CH", "de", "German" → "de"; anything else that is not English → null. */
export function normalizeLang(raw: string | null | undefined): SpokenLang | null {
  if (!raw) return null;
  const code = raw.trim().toLowerCase();
  if (code.startsWith("de")) return "de";
  if (code.startsWith("en")) return "en";
  return null;
}

/**
 * The locale to ask for when no actual voice could be found.
 *
 * en-GB rather than en-US: this is a student at an international school in
 * Switzerland sitting IGCSE papers, where the English being taught is
 * British — and it is the accent that was asked for.
 */
export const DEFAULT_LOCALE: Record<SpokenLang, string> = { en: "en-GB", de: "de-DE" };

/**
 * Locales to prefer within a language, best first.
 *
 * Only a preference: a device that has no British voice gets whichever
 * English voice it does have, because any English voice reading English is
 * better than a German one.
 */
const PREFERRED_LOCALES: Record<SpokenLang, string[]> = {
  en: ["en-gb", "en-us", "en-au", "en-ie", "en-za", "en-nz", "en-in"],
  de: ["de-de", "de-ch", "de-at"],
};

/**
 * Names the good voices have.
 *
 * Every platform ships two tiers under one list: an old formant-synthesis
 * voice that sounds like a 1990s answering machine, and a neural one that
 * sounds like a person. They are only told apart by their names, which is
 * ugly but is the only signal the Web Speech API exposes — there is no
 * quality field on a SpeechSynthesisVoice.
 */
const QUALITY_MARKERS = [
  "natural", // Microsoft Edge: "Microsoft Sonia Online (Natural) - English (United Kingdom)"
  "neural",
  "premium",
  "enhanced", // Apple: "Serena (Enhanced)"
  "siri",
  "online",
  "google", // Chrome's cloud voices
  "wavenet",
  "studio",
];

/** Names of the old robotic voices, kept out of the way unless nothing else exists. */
const POOR_MARKERS = ["compact", "espeak", "pico", "festival", "eloquence", "novelty", "whisper", "zarvox", "trinoids"];

export function voiceScore(voice: VoiceLike, lang: SpokenLang): number {
  const code = (voice.lang ?? "").toLowerCase().replace("_", "-");
  const base = code.split("-")[0];
  // Not this language at all: unusable, whatever else it has going for it.
  if (base !== lang) return -1;

  let score = 100;

  const preferred = PREFERRED_LOCALES[lang].indexOf(code);
  // Earlier in the preference list is better; an unlisted locale of the
  // right language still beats nothing.
  score += preferred >= 0 ? (PREFERRED_LOCALES[lang].length - preferred) * 10 : 0;

  const name = (voice.name ?? "").toLowerCase();
  if (QUALITY_MARKERS.some((marker) => name.includes(marker))) score += 40;
  if (POOR_MARKERS.some((marker) => name.includes(marker))) score -= 60;
  // A cloud voice is the better one wherever a browser offers both, and
  // localService is the only flag that distinguishes them.
  if (voice.localService === false) score += 15;

  return score;
}

/**
 * The best voice this device has for a language, or null when it has none.
 *
 * Null matters: with no voice of that language, asking for one and getting
 * the system default is exactly the bug being fixed. The caller then sets
 * only the locale and lets the browser do what it can.
 */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], lang: SpokenLang): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const voice of voices) {
    const score = voiceScore(voice, lang);
    if (score <= 0) continue;
    // Strictly greater, so the first of equals wins and the choice does not
    // change between two sentences of the same reply.
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Everything the caller needs to set on an utterance.
 *
 * One function so the three places that speak cannot drift apart again —
 * they each had their own copy of `utterance.lang = navigator.language`, and
 * each was wrong in the same way.
 */
export function voiceFor<T extends VoiceLike>(
  text: string,
  voices: readonly T[],
  deviceLang?: string | null
): { lang: string; voice: T | null } {
  const spoken = detectSpokenLang(text, deviceLang);
  const voice = pickVoice(voices, spoken);
  return { lang: voice?.lang ?? DEFAULT_LOCALE[spoken], voice };
}
