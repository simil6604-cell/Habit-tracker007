"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The Web Speech API has no official TS DOM typings yet — this is a minimal
// shape covering only what the app uses.
type SpeechRecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionEvent = { resultIndex: number; results: ArrayLike<SpeechRecognitionResult> };
type SpeechRecognitionErrorEvent = { error: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

/** A pause in speech ends a session every few seconds; a broken one ends it instantly. */
const RESTART_WINDOW_MS = 10_000;
const MAX_RESTARTS_PER_WINDOW = 12;

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access was blocked — allow it for this site in your browser settings and try again.",
  "service-not-allowed": "Your browser blocked speech recognition for this page.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs a network connection and couldn't reach the service.",
};

export type SpeechRecognitionState = {
  /** False on browsers with no Web Speech API at all (notably Firefox). */
  supported: boolean;
  listening: boolean;
  /** Everything recognised so far this session. */
  transcript: string;
  /** The words currently being spoken, not yet finalised. */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
};

/**
 * Dictation that survives a pause.
 *
 * Browsers end a recognition session every time you stop speaking for a
 * moment, which makes a "hold a conversation" mic look broken seconds in. The
 * restart-on-end behaviour here is the whole point of the hook: `onend` only
 * ends the session when the caller actually asked it to stop, and a pause
 * ("no-speech") or a self-triggered abort is not an error worth surfacing.
 */
export function useSpeechRecognition(options?: { lang?: string; onFinal?: (text: string) => void }): SpeechRecognitionState {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  /*
   * The words being spoken right now, before the recogniser has committed to
   * them.
   *
   * Kept because a session can end on top of them. The browser ends its own
   * session constantly — every pause, and whenever it feels like it — and
   * everything that was still interim at that moment was simply dropped. In
   * a lesson that is half a sentence gone every couple of minutes, which is
   * exactly the detail someone means when they say it did not hear
   * everything. On end it is flushed through as though it had been final.
   */
  const interimRef = useRef("");
  const wantListeningRef = useRef(false);
  // Restarting on every pause assumes the session lasted a moment. Where it
  // ends instantly and forever — iOS Safari does not really support continuous
  // recognition — that assumption spins: restart, end, restart, hundreds of
  // times a second, with the mic indicator flickering and nothing recognised.
  // These track that so it can stop and say so instead.
  const restartsRef = useRef(0);
  const firstRestartAtRef = useRef(0);
  // Held in a ref so a re-render with a new callback doesn't tear down the mic.
  const onFinalRef = useRef(options?.onFinal);
  onFinalRef.current = options?.onFinal;
  const langRef = useRef(options?.lang);
  langRef.current = options?.lang;

  /**
   * Hands over whatever was still being spoken when the session ended.
   *
   * Safe to call whenever a session is over: that session's interim text can
   * never arrive again as a final result, so this cannot duplicate anything.
   */
  const flushInterim = useCallback(() => {
    const pending = interimRef.current.trim();
    interimRef.current = "";
    if (!pending) return;
    setTranscript((t) => (t ? `${t} ${pending}` : pending).trim());
    onFinalRef.current?.(pending);
    setInterim("");
  }, []);

  useEffect(() => setSupported(Boolean(getSpeechRecognitionCtor())), []);

  useEffect(
    () => () => {
      wantListeningRef.current = false;
      recognitionRef.current?.stop();
    },
    []
  );

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || wantListeningRef.current) return;

    setError(null);
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = langRef.current ?? (typeof navigator !== "undefined" ? navigator.language : "en-GB");

    recognition.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalChunk += result[0].transcript;
        else interimChunk += result[0].transcript;
      }
      if (finalChunk) {
        setTranscript((t) => (t ? `${t} ${finalChunk}` : finalChunk).trim());
        onFinalRef.current?.(finalChunk.trim());
      }
      interimRef.current = interimChunk;
      setInterim(interimChunk);
    };

    recognition.onerror = (event) => {
      // A pause in speech and an abort we caused ourselves are normal.
      if (event.error === "no-speech" || event.error === "aborted") return;
      wantListeningRef.current = false;
      setListening(false);
      setError(ERROR_MESSAGES[event.error] ?? `Speech recognition failed (${event.error}).`);
    };

    recognition.onend = () => {
      // Whatever was mid-sentence when this ended is kept rather than lost.
      flushInterim();
      // Only the recognizer that is still the active one may restart itself:
      // a stop followed quickly by a start creates a second recognizer, and
      // without this check the old one revives alongside it and can no longer
      // be stopped, because stop() only holds the newest.
      if (!wantListeningRef.current || recognitionRef.current !== recognition) {
        setListening(false);
        return;
      }

      const now = Date.now();
      if (now - firstRestartAtRef.current > RESTART_WINDOW_MS) {
        firstRestartAtRef.current = now;
        restartsRef.current = 0;
      }
      restartsRef.current += 1;
      if (restartsRef.current > MAX_RESTARTS_PER_WINDOW) {
        wantListeningRef.current = false;
        recognitionRef.current = null;
        setListening(false);
        setError(
          // Worded for both the places this hook is used: dictating a question
          // into a box, and recording a whole lesson. "Type instead" is right
          // for the first and nonsense for the second, so it says neither.
          "This browser keeps ending the recording immediately, so the microphone can't stay open here. Chrome handles this best."
        );
        return;
      }

      try {
        recognition.start();
      } catch {
        // Already restarting — the next onend will try again.
      }
    };

    recognitionRef.current = recognition;
    wantListeningRef.current = true;
    restartsRef.current = 0;
    firstRestartAtRef.current = 0;
    try {
      recognition.start();
      setListening(true);
    } catch {
      wantListeningRef.current = false;
      setListening(false);
      setError("Couldn't start the microphone.");
    }
  }, [flushInterim]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    const recognition = recognitionRef.current;
    // Dropped before stopping, so the onend guard above sees it is no longer
    // the active recognizer even if a restart is already in flight.
    recognitionRef.current = null;
    recognition?.stop();
    // The last words before Stop was pressed count too — pressing it while
    // still finishing a sentence is the normal way to use this.
    flushInterim();
    setListening(false);
    setInterim("");
  }, [flushInterim]);

  const reset = useCallback(() => {
    interimRef.current = "";
    setTranscript("");
    setInterim("");
  }, []);

  return { supported, listening, transcript, interim, error, start, stop, reset };
}
