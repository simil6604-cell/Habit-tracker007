"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";

type Result = "pass" | "fail" | "unknown";

function Row({ result, label, detail }: { result: Result; label: string; detail: string }) {
  const mark = result === "pass" ? "✅" : result === "fail" ? "❌" : "•";
  return (
    <li className="flex items-start gap-2 text-sm">
      <span aria-hidden className="w-4 shrink-0">{mark}</span>
      <span className="min-w-0">
        <span className={result === "fail" ? "font-medium text-danger" : "font-medium"}>{label}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
    </li>
  );
}

/**
 * Checks the microphone on the device you're actually holding.
 *
 * Voice can fail for four unrelated reasons — the browser has no speech
 * recognition, the page isn't on a secure origin, permission was refused, or
 * it starts and hears nothing — and they need four different fixes. Trying the
 * tutor and getting silence tells you none of that. This separates them, and
 * ends with the only proof that counts: your own words coming back.
 */
export function MicrophoneCheck() {
  const [supported, setSupported] = useState<Result>("unknown");
  const [secure, setSecure] = useState<Result>("unknown");
  const [heard, setHeard] = useState("");
  const mic = useSpeechRecognition({ onFinal: (chunk) => setHeard((t) => `${t} ${chunk}`.trim()) });

  useEffect(() => {
    setSupported(mic.supported ? "pass" : "fail");
    // Speech recognition and the microphone are only available on a secure
    // origin. localhost counts; a plain-http deployment does not, and fails
    // with a permissions error that points nowhere near the real cause.
    setSecure(window.isSecureContext ? "pass" : "fail");
  }, [mic.supported]);

  const permission: Result = mic.error ? "fail" : mic.listening || heard ? "pass" : "unknown";
  const capture: Result = heard ? "pass" : mic.listening ? "unknown" : "unknown";

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        <Row
          result={supported}
          label="This browser can do speech recognition"
          detail={
            supported === "fail"
              ? "It can't — Firefox has no Web Speech API. Use Chrome, Edge or Safari for dictation; typing works everywhere."
              : "The Web Speech API is available here."
          }
        />
        <Row
          result={secure}
          label="The page is on a secure connection"
          detail={
            secure === "fail"
              ? "It isn't. Browsers only allow the microphone over https (or on localhost), so dictation cannot work on this address."
              : "https or localhost — the microphone is allowed to run."
          }
        />
        <Row
          result={permission}
          label="Microphone permission"
          detail={
            mic.error
              ? mic.error
              : permission === "pass"
                ? "Granted."
                : "Not tested yet — press the button below and allow access when your browser asks."
          }
        />
        <Row
          result={capture}
          label="It actually hears you"
          detail={
            heard
              ? `Heard: "${heard}"`
              : mic.listening
                ? "Listening… say a few words."
                : "Not tested yet. This is the one that matters — the rest can pass while the mic stays silent."
          }
        />
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={mic.listening ? "secondary" : "outline"}
          disabled={!mic.supported}
          onClick={() => {
            if (mic.listening) {
              mic.stop();
            } else {
              setHeard("");
              mic.reset();
              mic.start();
            }
          }}
        >
          {mic.listening ? <MicOff size={14} /> : <Mic size={14} />}
          {mic.listening ? "Stop" : "Test my microphone"}
        </Button>
        {mic.listening && mic.interim && <span className="text-xs text-muted">…{mic.interim}</span>}
      </div>

      {heard && !mic.listening && (
        <p className="rounded-lg bg-success/10 p-2.5 text-sm text-success">
          Your microphone works here. Dictation in the AI Coach and the class recorder will work the same way.
        </p>
      )}
    </div>
  );
}
