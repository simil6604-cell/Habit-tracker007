import { decideSpokenLang, normalizeLang, type SpokenLang } from "./browser-voice";

/**
 * Which language dictation listens in.
 *
 * The Web Speech API does not detect the language — it is told one, and
 * everything it hears is forced through that language's model. Ask it for
 * English and say a German sentence and you do not get a bad transcript,
 * you get English words that sound vaguely similar. That is most of what
 * "the recording is not good enough" turns out to be for someone who thinks
 * in German and is taught in English.
 *
 * There is no way around choosing. So it is a visible choice, remembered,
 * rather than a hidden one taken from the device.
 */

export type DictationLang = { code: string; label: string; short: string; base: SpokenLang };

export const DICTATION_LANGS: DictationLang[] = [
  { code: "en-GB", label: "English (UK)", short: "EN", base: "en" },
  { code: "de-DE", label: "Deutsch", short: "DE", base: "de" },
  { code: "de-CH", label: "Deutsch (CH)", short: "DE-CH", base: "de" },
];

export const DEFAULT_DICTATION_LANG = "en-GB";

export function isDictationLang(value: unknown): value is string {
  return typeof value === "string" && DICTATION_LANGS.some((lang) => lang.code === value);
}

/**
 * Recognition targets that are a dialect rather than a country's spelling of
 * the same language.
 *
 * de-CH is Swiss German, which is a different spoken language from the
 * Standard German it shares a flag with. Someone on a Swiss phone is
 * overwhelmingly likely to be dictating Hochdeutsch — at school, about
 * school — and forcing that through a Swiss German model is a way to be
 * misheard every sentence while everything looks correctly set up.
 *
 * So it stays in the list, because someone who does speak it should be able
 * to choose it, and it is never chosen for anyone by default.
 */
const DIALECT_CODES = ["de-CH"];

/**
 * What to listen in before anyone has chosen.
 *
 * The device's language, when it is one of these — someone whose phone is in
 * German is more likely than not to dictate in German. An exact match wins
 * over the same language in another country, except for the dialect targets
 * above: a Swiss phone gets Standard German, not Swiss German.
 */
export function defaultDictationLang(deviceLang?: string | null): string {
  if (!deviceLang) return DEFAULT_DICTATION_LANG;
  const wanted = deviceLang.trim().toLowerCase();
  const exact = DICTATION_LANGS.find(
    (lang) => lang.code.toLowerCase() === wanted && !DIALECT_CODES.includes(lang.code)
  );
  if (exact) return exact.code;
  const base = normalizeLang(deviceLang);
  const sameLanguage = base
    ? DICTATION_LANGS.find((lang) => lang.base === base && !DIALECT_CODES.includes(lang.code))
    : undefined;
  return sameLanguage?.code ?? DEFAULT_DICTATION_LANG;
}

/** What was remembered, if it is still one of the options. */
export function parseDictationLang(stored: unknown, deviceLang?: string | null): string {
  return isDictationLang(stored) ? stored : defaultDictationLang(deviceLang);
}

export function dictationLabel(code: string): string {
  return DICTATION_LANGS.find((lang) => lang.code === code)?.short ?? code;
}

/**
 * How many words it takes before a mismatch is worth mentioning.
 *
 * "Ja" and "okay" are both languages, and offering to switch after one word
 * would make the offer appear constantly and mean nothing. Four words in,
 * the marker counting that decides this is reliable.
 */
const MIN_WORDS_TO_JUDGE = 4;

/**
 * The language that was actually spoken, when it is plainly not the one
 * being listened in — otherwise null.
 *
 * This is the fix for the complaint that it "doesn't listen properly". Asked
 * for English and given German, speech recognition does not fail in a way
 * anyone can see: it returns confident English words that sound a bit like
 * what was said, and the tutor then answers a question nobody asked. The
 * transcript is the evidence, so it is read, and the offer to switch is put
 * where the mistake is visible.
 */
export function mismatchedLang(heard: string, listeningIn: string): DictationLang | null {
  const words = heard.trim().split(/\s+/).filter(Boolean);
  if (words.length < MIN_WORDS_TO_JUDGE) return null;

  const current = DICTATION_LANGS.find((lang) => lang.code === listeningIn);
  if (!current) return null;

  // The version that may answer "I cannot tell": with nothing to go on this
  // must say nothing rather than guess, or it would offer to switch on every
  // formula and every list of numbers.
  const spoken = decideSpokenLang(heard);
  if (!spoken || spoken === current.base) return null;

  // The same country first where there is one — someone on de-CH who spoke
  // English wants en-GB, and someone on en-GB who spoke German wants de-DE
  // rather than de-CH.
  return DICTATION_LANGS.find((lang) => lang.base === spoken) ?? null;
}
