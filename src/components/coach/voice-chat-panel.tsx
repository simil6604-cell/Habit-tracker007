"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { Mic, MicOff, Send, Trash2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIMessageContent } from "@/components/shared/ai-message";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";
import {
  sendCoachMessageLive,
  clearCoachChat,
  type CoachMessage,
} from "@/lib/ai/coach-actions";

/** Strips the diagram blocks before speaking — nobody wants SVG read aloud. */
function speakableText(content: string): string {
  return content.replace(/```svg[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
}

function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function VoiceChatPanel({ initialMessages }: { initialMessages: CoachMessage[] }) {
  const [messages, setMessages] = useState<CoachMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [speakReplies, setSpeakReplies] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Which reply we've already read out, so a re-render doesn't repeat it.
  const spokenRef = useRef<string | null>(null);

  const mic = useSpeechRecognition();

  useEffect(() => setCanSpeak(speechSupported()), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  // Dictation feeds the same box you'd type in, so you can fix a misheard word
  // before sending rather than being stuck with it.
  useEffect(() => {
    if (mic.transcript) setInput(mic.transcript);
  }, [mic.transcript]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setInput("");
    mic.reset();
    setMessages((prev) => [
      ...prev,
      { id: `pending-${Date.now()}`, role: "USER", content: trimmed, createdAt: new Date() },
    ]);
    startTransition(async () => setMessages(await sendCoachMessageLive(trimmed)));
  }

  function toggleMic() {
    if (mic.listening) {
      mic.stop();
      // Stopping is how you finish a spoken turn, so send what was heard.
      const heard = (mic.transcript || input).trim();
      if (heard) send(heard);
    } else {
      // Never listen to our own voice.
      if (canSpeak) window.speechSynthesis.cancel();
      mic.reset();
      setInput("");
      mic.start();
    }
  }

  const lastReply = [...messages].reverse().find((m) => m.role === "ASSISTANT");

  useEffect(() => {
    if (!speakReplies || !canSpeak || !lastReply || pending) return;
    if (lastReply.id === spokenRef.current || lastReply.id.startsWith("pending-")) return;
    spokenRef.current = lastReply.id;

    const text = speakableText(lastReply.content);
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = navigator.language || "en-GB";
    window.speechSynthesis.speak(utterance);
  }, [lastReply, speakReplies, canSpeak, pending]);

  // Leaving the page mid-sentence shouldn't leave the browser talking.
  useEffect(() => () => { if (speechSupported()) window.speechSynthesis.cancel(); }, []);

  function toggleSpeaking() {
    const next = !speakReplies;
    setSpeakReplies(next);
    if (!next && canSpeak) window.speechSynthesis.cancel();
    // Turning it on shouldn't replay the whole backlog.
    if (next && lastReply) spokenRef.current = lastReply.id;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={mic.listening ? "secondary" : "outline"}
            onClick={toggleMic}
            disabled={!mic.supported || pending}
            title={mic.supported ? "Talk to your coach" : "This browser has no speech recognition"}
          >
            {mic.listening ? <MicOff size={14} /> : <Mic size={14} />}
            {mic.listening ? "Stop & send" : "Talk"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={speakReplies ? "secondary" : "outline"}
            onClick={toggleSpeaking}
            disabled={!canSpeak}
            title={canSpeak ? "Read replies out loud" : "This browser can't speak"}
          >
            {speakReplies ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {speakReplies ? "Speaking" : "Speak replies"}
          </Button>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => startTransition(async () => setMessages(await clearCoachChat()))}
            disabled={pending}
            className="text-muted hover:text-danger"
            title="Clear conversation"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {mic.listening && (
        <p className="mb-2 rounded-lg bg-accent/10 px-3 py-1.5 text-xs text-accent">
          🎙 Listening… {mic.interim || "say what's on your mind, then press Stop & send."}
        </p>
      )}
      {mic.error && <p className="mb-2 text-xs text-danger">{mic.error}</p>}
      {!mic.supported && (
        <p className="mb-2 text-xs text-muted">
          Voice input needs Chrome, Edge or Safari — this browser doesn&apos;t offer it, so type instead.
        </p>
      )}

      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center text-muted">
          <span className="text-3xl">✨</span>
          <p className="text-sm">
            Press <strong>Talk</strong> and just say it — or type. Ask things like &ldquo;I have an exam tomorrow and
            football training today, what should I do?&rdquo; When a picture explains it better, your coach draws one.
          </p>
        </div>
      ) : (
        <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto py-2">
          {messages.map((m) => (
            <div key={m.id} className={`flex flex-col gap-1 ${m.role === "USER" ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  m.role === "USER" ? "bg-accent text-accent-foreground" : "bg-surface-muted text-foreground"
                }`}
              >
                <AIMessageContent content={m.content} />
              </div>
              <span className="text-[10px] text-muted">{format(m.createdAt, "HH:mm")}</span>
            </div>
          ))}
          {pending && <p className="text-xs text-muted">Coach is thinking…</p>}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2 border-t border-border pt-3"
      >
        <input
          name="message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about exams, training, or your whole week…"
          disabled={pending}
          className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
        />
        <Button type="submit" size="md" disabled={pending || !input.trim()}>
          <Send size={16} />
        </Button>
      </form>
    </div>
  );
}
