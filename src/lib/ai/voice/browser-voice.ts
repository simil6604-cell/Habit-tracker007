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

import { expressionFor } from "@/lib/ai/expression";

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
  return decideSpokenLang(text) ?? normalizeLang(fallback) ?? "en";
}

/**
 * The same decision, with "I cannot tell" as an answer.
 *
 * Needed wherever being wrong is worse than saying nothing — telling someone
 * their dictation language is set wrong, for one. A formula, a list of
 * numbers or a two-word reply carries no markers at all, and a confident
 * answer there is a guess dressed up as a reading.
 */
export function decideSpokenLang(text: string): SpokenLang | null {
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
  return null;
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

/**
 * Voices worth asking for by name.
 *
 * The quality markers above catch most of it, but several of the best voices
 * on a phone say nothing about themselves in their name — "Samantha" and
 * "Anna" are the good Apple voices and read like nothing special in a list.
 * Named here so the pick is the one a person would make.
 */
const PREFERRED_NAMES: Record<SpokenLang, string[]> = {
  en: ["samantha", "serena", "daniel", "kate", "sonia", "ryan", "libby", "aria", "jenny", "karen", "moira"],
  de: ["anna", "petra", "markus", "katja", "conrad", "amala", "viktoria", "helena", "seraphina", "florian"],
};

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
  if (PREFERRED_NAMES[lang].some((known) => name.includes(known))) score += 25;
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
 * How fast and how high, for the voice that was picked.
 *
 * The browser's default is 1.0 and it reads like a station announcement:
 * evenly paced, every sentence the same. A person talking to one other
 * person is a shade quicker and a shade higher, and that small push is most
 * of the difference between "a computer is reading this out" and "someone
 * is telling me this".
 *
 * Only on a voice that can take it. The old formant voices distort when
 * they are pushed, so a device that only has one of those is left alone —
 * better flat than mangled.
 */
export function speechShape(
  voice: VoiceLike | null,
  expression?: unknown
): { rate: number; pitch: number } {
  if (!voice) return { rate: 1, pitch: 1 };
  const name = (voice.name ?? "").toLowerCase();
  const poor = POOR_MARKERS.some((marker) => name.includes(marker));
  // The old formant voices distort when they are pushed, so they are left
  // alone whatever the setting says — better flat than mangled.
  if (poor) return { rate: 1, pitch: 1 };
  return expressionFor(expression).browser;
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
  deviceLang?: string | null,
  expression?: unknown
): { lang: string; voice: T | null; rate: number; pitch: number } {
  const spoken = detectSpokenLang(text, deviceLang);
  const voice = pickVoice(voices, spoken);
  return { lang: voice?.lang ?? DEFAULT_LOCALE[spoken], voice, ...speechShape(voice, expression) };
}

/**
 * The text, cut where a speaker would draw breath.
 *
 * Two things this fixes. A long reply handed to the browser as one utterance
 * is read as one unbroken stream, and in Chrome it is also liable to stop
 * dead part way through — a documented limit on how long a single utterance
 * may be. Spoken as separate utterances, the synthesiser puts a real pause
 * between them, which is what a person does, and nothing is lost.
 *
 * Sentences are grouped rather than spoken one by one: a pause after every
 * four-word sentence sounds like someone reading a list.
 */
export function speechChunks(text: string, target = 220): string[] {
  const clean = text.trim();
  if (!clean) return [];

  // Split after . ! ? … and after a newline, keeping the punctuation.
  const sentences = clean
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!current) current = sentence;
    else if (current.length + sentence.length + 1 <= target) current = `${current} ${sentence}`;
    else {
      chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);

  // One sentence longer than the target on its own: a comma is the next best
  // place to breathe, and anything still over is left whole rather than cut
  // somewhere that would change the meaning.
  return chunks.flatMap((chunk) => (chunk.length <= target * 2 ? [chunk] : splitOnCommas(chunk, target)));
}

function splitOnCommas(text: string, target: number): string[] {
  const parts = text.split(/(?<=,)\s+/);
  const out: string[] = [];
  let current = "";
  for (const part of parts) {
    if (!current) current = part;
    else if (current.length + part.length + 1 <= target) current = `${current} ${part}`;
    else {
      out.push(current);
      current = part;
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Two voices that can be told apart, for an episode written as a
 * conversation.
 *
 * The contrast is the point. Two people talking is what makes an hour of
 * audio listenable, and it only works if the listener can hear instantly
 * which of them is speaking — on a phone, through one earbud, while
 * running.
 *
 * A device usually has several voices for a language, so the second speaker
 * gets the best one that is not the first. Where there is genuinely only
 * one, the voice is reused and shifted instead: the same voice a few
 * semitones up and a shade slower is still unmistakably a second person,
 * and it is better than pretending there is only one.
 */
export function pickVoicePair<T extends VoiceLike>(
  voices: readonly T[],
  lang: SpokenLang
): { a: T | null; b: T | null } {
  const a = pickVoice(voices, lang);
  if (!a) return { a: null, b: null };
  const rest = voices.filter((voice) => voice !== a && voice.name !== a.name);
  return { a, b: pickVoice(rest, lang) };
}

export type SpokenShape = { lang: string; voice: VoiceLike | null; rate: number; pitch: number };

/**
 * Everything to set on an utterance for one speaker of a two-voice episode.
 *
 * `decideFrom` is the whole script rather than this line: "Genau." on its
 * own is not enough to tell the languages apart, and one line read in the
 * wrong language is worse than none of it being.
 */
export function voiceForSpeaker<T extends VoiceLike>(
  speaker: "A" | "B",
  voices: readonly T[],
  decideFrom: string,
  deviceLang?: string | null,
  expression?: unknown
): { lang: string; voice: T | null; rate: number; pitch: number } {
  const spoken = detectSpokenLang(decideFrom, deviceLang);
  const pair = pickVoicePair(voices, spoken);
  const own = speaker === "A" ? pair.a : pair.b ?? pair.a;
  const shape = speechShape(own, expression);

  // Only one voice on the device: the second speaker is the same voice,
  // shifted enough to be heard as somebody else.
  const shifted = speaker === "B" && (!pair.b || pair.b === pair.a);
  return {
    lang: own?.lang ?? DEFAULT_LOCALE[spoken],
    voice: own,
    rate: shifted ? Math.max(0.8, shape.rate - 0.06) : shape.rate,
    pitch: shifted ? Math.min(2, shape.pitch + 0.18) : shape.pitch,
  };
}
