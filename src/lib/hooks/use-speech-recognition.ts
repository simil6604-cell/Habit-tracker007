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
  const wantListeningRef = useRef(false);
  // Held in a ref so a re-render with a new callback doesn't tear down the mic.
  const onFinalRef = useRef(options?.onFinal);
  onFinalRef.current = options?.onFinal;
  const langRef = useRef(options?.lang);
  langRef.current = options?.lang;

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
      // Only the recognizer that is still the active one may restart itself:
      // a stop followed quickly by a start creates a second recognizer, and
      // without this check the old one revives alongside it and can no longer
      // be stopped, because stop() only holds the newest.
      if (!wantListeningRef.current || recognitionRef.current !== recognition) {
        setListening(false);
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
    try {
      recognition.start();
      setListening(true);
    } catch {
      wantListeningRef.current = false;
      setListening(false);
      setError("Couldn't start the microphone.");
    }
  }, []);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    const recognition = recognitionRef.current;
    // Dropped before stopping, so the onend guard above sees it is no longer
    // the active recognizer even if a restart is already in flight.
    recognitionRef.current = null;
    recognition?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInterim("");
  }, []);

  return { supported, listening, transcript, interim, error, start, stop, reset };
}
