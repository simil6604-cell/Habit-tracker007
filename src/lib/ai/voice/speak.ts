"use client";

import { voiceFor } from "./browser-voice";

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
 * the best voice the device has for it.
 */
export function utteranceFor(text: string, deviceLang?: string | null): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text);
  const chosen = voiceFor(
    text,
    availableVoices(),
    deviceLang ?? (typeof navigator !== "undefined" ? navigator.language : null)
  );
  utterance.lang = chosen.lang;
  if (chosen.voice) utterance.voice = chosen.voice;
  return utterance;
}
