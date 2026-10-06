"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeechRecognition } from "./use-speech-recognition";
import { spokenGreeting, toSpokenText, type VoiceWho } from "@/lib/ai/spoken-mode";

/** How long a silence has to last before a spoken turn counts as finished. */
export const TURN_END_SILENCE_MS = 1400;

/**
 * How long to wait for the synthesiser to say it has finished before taking
 * the turn back anyway.
 *
 * Some browsers never fire `onend` at all — a device with no voices
 * installed, a muted phone, a tab the system has throttled. Without this the
 * conversation sits on "Talking…" with the microphone shut and no way
 * forward but reloading the page, which is indistinguishable from the whole
 * feature being broken. Found exactly that way: driving voice mode in a
 * container with no audio hung it on the greeting.
 *
 * Generous, because cutting a real sentence short is worse than waiting: the
 * floor covers a short reply and the per-word allowance is about three times
 * slower than anyone speaks.
 */
export const SPEECH_WATCHDOG_FLOOR_MS = 6_000;
export const SPEECH_WATCHDOG_PER_WORD_MS = 900;
export const SPEECH_WATCHDOG_CEILING_MS = 90_000;

export function speechWatchdogMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(SPEECH_WATCHDOG_CEILING_MS, Math.max(SPEECH_WATCHDOG_FLOOR_MS, words * SPEECH_WATCHDOG_PER_WORD_MS));
}

export type VoiceConversation = {
  supported: boolean;
  /** Voice mode is on: it greets, listens, answers out loud and listens again. */
  active: boolean;
  listening: boolean;
  speaking: boolean;
  /** The words being spoken right now, before they are finalised. */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  /** Say a reply out loud, then go back to listening. */
  speak: (text: string) => void;
};

function synthSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Voice as a conversation rather than as a dictation box.
 *
 * Dictation already worked: hold the button, watch your words appear, press
 * send. That is a form you fill in by talking, and it is not what people mean
 * by talking to it. The difference is three things, and all three have to be
 * there or none of them helps:
 *
 * It opens. Switching voice on says something first, so there is a turn to
 * answer rather than a silent microphone to perform into.
 *
 * It takes your turn when you stop. A pause of about a second and a half ends
 * what you were saying and sends it — no button between finishing a sentence
 * and being answered.
 *
 * It answers out loud and then listens again, so the next thing you say needs
 * no button either.
 *
 * The one thing it must never do is hear itself. The microphone is closed for
 * as long as the synthesiser is talking and only reopens when it has finished,
 * because a browser that transcribes its own voice answers its own questions
 * forever.
 */
export function useVoiceConversation({
  who,
  onSend,
  lang,
}: {
  who: VoiceWho;
  onSend: (text: string) => void;
  lang?: string;
}): VoiceConversation {
  const [active, setActive] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [canSynth, setCanSynth] = useState(false);

  const activeRef = useRef(false);
  const heardRef = useRef("");
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  useEffect(() => setCanSynth(synthSupported()), []);

  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSilence = () => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = null;
  };

  const clearWatchdog = () => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
  };

  const mic = useSpeechRecognition({
    lang,
    onFinal: (chunk) => {
      if (!activeRef.current) return;
      heardRef.current = heardRef.current ? `${heardRef.current} ${chunk}` : chunk;
      clearSilence();
      silenceRef.current = setTimeout(() => {
        const heard = heardRef.current.trim();
        heardRef.current = "";
        if (!heard) return;
        // Closed while the answer is worked out and spoken: anything said
        // into that gap would be transcribed on top of the next turn.
        micRef.current.stop();
        micRef.current.reset();
        onSendRef.current(heard);
      }, TURN_END_SILENCE_MS);
    },
  });

  // The callback above is created once, so it cannot close over a fresh `mic`.
  const micRef = useRef(mic);
  micRef.current = mic;

  const speak = useCallback(
    (text: string) => {
      const spokenText = toSpokenText(text);
      if (!synthSupported() || !spokenText) {
        // Nothing to say, but the turn still belongs to them next.
        if (activeRef.current) micRef.current.start();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.lang = lang ?? (typeof navigator !== "undefined" ? navigator.language : "en-GB");

      let handedOver = false;
      const handOver = () => {
        // onend and the watchdog can both arrive; the second must do nothing,
        // or the microphone is started twice and the first one is orphaned.
        if (handedOver) return;
        handedOver = true;
        clearWatchdog();
        setSpeaking(false);
        if (activeRef.current) micRef.current.start();
      };
      utterance.onend = handOver;
      // A synthesiser that fails silently would leave the microphone shut and
      // voice mode looking hung, so an error hands the turn over as well.
      utterance.onerror = handOver;

      setSpeaking(true);
      clearWatchdog();
      watchdogRef.current = setTimeout(handOver, speechWatchdogMs(spokenText));
      window.speechSynthesis.speak(utterance);
    },
    [lang]
  );

  const start = useCallback(() => {
    activeRef.current = true;
    setActive(true);
    heardRef.current = "";
    micRef.current.reset();
    speak(spokenGreeting(who));
  }, [speak, who]);

  const stop = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setSpeaking(false);
    clearSilence();
    clearWatchdog();
    heardRef.current = "";
    if (synthSupported()) window.speechSynthesis.cancel();
    micRef.current.stop();
  }, []);

  // Leaving the page mid-sentence must not leave the browser talking, or the
  // microphone open on a page nobody is looking at.
  useEffect(
    () => () => {
      activeRef.current = false;
      clearSilence();
      clearWatchdog();
      if (synthSupported()) window.speechSynthesis.cancel();
    },
    []
  );

  // A microphone that failed is not a conversation any more; saying so and
  // standing down beats a button that claims to be listening.
  useEffect(() => {
    if (mic.error && activeRef.current) {
      activeRef.current = false;
      setActive(false);
      setSpeaking(false);
    }
  }, [mic.error]);

  return {
    supported: mic.supported && canSynth,
    active,
    listening: mic.listening,
    speaking,
    interim: mic.interim,
    error: mic.error,
    start,
    stop,
    speak,
  };
}
