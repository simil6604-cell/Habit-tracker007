import { normalizeLang, type SpokenLang } from "./browser-voice";

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
 * What to listen in before anyone has chosen.
 *
 * The device's language, when it is one of these — someone whose phone is in
 * German is more likely than not to dictate in German. An exact match wins
 * over the same language in another country, so a Swiss phone gets de-CH.
 */
export function defaultDictationLang(deviceLang?: string | null): string {
  if (!deviceLang) return DEFAULT_DICTATION_LANG;
  const wanted = deviceLang.trim().toLowerCase();
  const exact = DICTATION_LANGS.find((lang) => lang.code.toLowerCase() === wanted);
  if (exact) return exact.code;
  const base = normalizeLang(deviceLang);
  const sameLanguage = base ? DICTATION_LANGS.find((lang) => lang.base === base) : undefined;
  return sameLanguage?.code ?? DEFAULT_DICTATION_LANG;
}

/** What was remembered, if it is still one of the options. */
export function parseDictationLang(stored: unknown, deviceLang?: string | null): string {
  return isDictationLang(stored) ? stored : defaultDictationLang(deviceLang);
}

export function dictationLabel(code: string): string {
  return DICTATION_LANGS.find((lang) => lang.code === code)?.short ?? code;
}
