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

/**
 * How long a piece with no words stays up before moving on.
 *
 * A picture whose sentence came back empty would otherwise flash past between
 * two utterances, which looks like a glitch rather than a step.
 */
export const SILENT_STEP_DWELL_MS = 1_600;

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
  /**
   * Say a reply one piece at a time, telling the caller as each piece starts.
   *
   * What makes the board work: the picture for a sentence goes up as that
   * sentence begins, rather than the whole answer appearing at once. One
   * utterance per piece is what gives a place to hang that on — the synthesiser
   * offers no reliable "which sentence are you on" event of its own.
   */
  speakSteps: (pieces: string[], onPieceStart?: (index: number) => void) => void;
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

  /**
   * Which sequence is currently being spoken.
   *
   * Cancelling the synthesiser fires `onend` for the utterance it cut off in
   * some browsers, and that handler would otherwise walk on to the next piece
   * of a sequence that has just been abandoned — the browser talking over the
   * person who pressed stop. Every handler carries the generation it belongs
   * to and does nothing once that number has moved on.
   */
  const generationRef = useRef(0);

  const speakSteps = useCallback(
    (pieces: string[], onPieceStart?: (index: number) => void) => {
      const generation = ++generationRef.current;
      const current = () => generationRef.current === generation;

      clearWatchdog();
      if (synthSupported()) window.speechSynthesis.cancel();

      const finish = () => {
        if (!current()) return;
        setSpeaking(false);
        // The turn goes back to them whether or not anything was said.
        if (activeRef.current) micRef.current.start();
      };

      let index = 0;
      const sayNext = () => {
        if (!current()) return;
        if (index >= pieces.length) {
          finish();
          return;
        }
        const at = index++;
        onPieceStart?.(at);

        const spokenText = toSpokenText(pieces[at] ?? "");
        if (!synthSupported()) {
          finish();
          return;
        }
        if (!spokenText) {
          // Nothing to say for this one. Where it is one step of a board its
          // picture is on screen, so hold it long enough to be seen; where it
          // is the whole reply there is nothing to look at and nothing to
          // wait for, and the turn goes straight back.
          clearWatchdog();
          if (pieces.length > 1) {
            watchdogRef.current = setTimeout(sayNext, SILENT_STEP_DWELL_MS);
          } else {
            finish();
          }
          return;
        }

        const utterance = new SpeechSynthesisUtterance(spokenText);
        utterance.lang = lang ?? (typeof navigator !== "undefined" ? navigator.language : "en-GB");

        let handedOver = false;
        const handOver = () => {
          // onend and the watchdog can both arrive; the second must do
          // nothing, or two sequences run at once from here.
          if (handedOver) return;
          handedOver = true;
          clearWatchdog();
          sayNext();
        };
        utterance.onend = handOver;
        // A synthesiser that fails silently would leave the microphone shut
        // and voice mode looking hung, so an error moves on as well.
        utterance.onerror = handOver;

        clearWatchdog();
        watchdogRef.current = setTimeout(handOver, speechWatchdogMs(spokenText));
        window.speechSynthesis.speak(utterance);
      };

      setSpeaking(true);
      sayNext();
    },
    [lang]
  );

  const speak = useCallback((text: string) => speakSteps([text]), [speakSteps]);

  const start = useCallback(() => {
    activeRef.current = true;
    setActive(true);
    heardRef.current = "";
    micRef.current.reset();
    speak(spokenGreeting(who));
  }, [speak, who]);

  const stop = useCallback(() => {
    // Moves the generation on, so an onend from the utterance being cancelled
    // below cannot start the next piece of the sequence.
    generationRef.current++;
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
      generationRef.current++;
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
    speakSteps,
  };
}
