"use client";

import { speechChunks, voiceFor, voiceForSpeaker } from "./browser-voice";

/**
 * Saying something with the browser's own voice, set up properly.
 *
 * The voice list is the awkward part: on Chrome it is empty on first call
 * and arrives later on a `voiceschanged` event, so anything that reads it
 * once at module load gets nothing and silently falls back to the default
 * voice — the bug this is here to prevent. It is read fresh every time
 * instead, which is cheap, and primed on load so the first sentence of a
 * conversation already has it.
 */

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Nudges the browser into loading its voices, so the first one is right. */
export function primeVoices(): void {
  if (!speechSupported()) return;
  // Reading the list is what starts it loading in Chrome.
  window.speechSynthesis.getVoices();
}

export function availableVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  try {
    return window.speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

/**
 * Builds an utterance that will be read in the language it is written in, by
 * the best voice the device has for it, at the pace someone talking uses.
 *
 * `shapeOf` decides the language from the text being spoken, so a chunk is
 * always passed the WHOLE reply to decide from: four words on their own
 * ("Genau, so ist es.") are not enough to tell the languages apart, and a
 * single sentence read in the wrong one is worse than none of it being.
 */
export function utteranceFor(
  text: string,
  deviceLang?: string | null,
  decideFrom?: string,
  expression?: unknown
): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text);
  const chosen = voiceFor(
    decideFrom ?? text,
    availableVoices(),
    deviceLang ?? (typeof navigator !== "undefined" ? navigator.language : null),
    expression
  );
  utterance.lang = chosen.lang;
  if (chosen.voice) utterance.voice = chosen.voice;
  utterance.rate = chosen.rate;
  utterance.pitch = chosen.pitch;
  return utterance;
}

/**
 * Says something out loud, in the pieces a person would say it in.
 *
 * Queued as separate utterances rather than one: the synthesiser puts a real
 * pause between them, which is what makes a long answer sound spoken rather
 * than recited, and it sidesteps Chrome's habit of cutting a long single
 * utterance off part way through.
 *
 * `speechSynthesis.cancel()` still stops all of it, so every caller that
 * already cancels before speaking keeps working unchanged.
 */
export function speakAloud(text: string, deviceLang?: string | null, expression?: unknown): void {
  if (!speechSupported()) return;
  const chunks = speechChunks(text);
  for (const chunk of chunks) {
    // Each chunk is told to decide its language from the whole reply.
    window.speechSynthesis.speak(utteranceFor(chunk, deviceLang, text, expression));
  }
}

/**
 * An utterance for one speaker of a two-voice episode.
 *
 * Separate from utteranceFor because the choice is different: that one
 * picks the single best voice for the language, this one picks this
 * speaker's half of a contrasting pair.
 */
export function utteranceForSpeaker(
  speaker: "A" | "B",
  text: string,
  script: string,
  deviceLang?: string | null,
  expression?: unknown
): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text);
  const chosen = voiceForSpeaker(
    speaker,
    availableVoices(),
    script,
    deviceLang ?? (typeof navigator !== "undefined" ? navigator.language : null),
    expression
  );
  utterance.lang = chosen.lang;
  if (chosen.voice) utterance.voice = chosen.voice;
  utterance.rate = chosen.rate;
  utterance.pitch = chosen.pitch;
  return utterance;
}
