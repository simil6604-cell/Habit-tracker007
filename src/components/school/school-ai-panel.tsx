"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { ImagePlus, Mic, MicOff, Send, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIMessageContent } from "@/components/shared/ai-message";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";
import { MAX_PHOTOS_PER_MESSAGE, PHOTO_ACCEPT } from "@/lib/school/school-ai-photos";
import {
  clearSchoolAIChat,
  discardSchoolAIPhoto,
  sendSchoolAIMessage,
  uploadSchoolAIPhotos,
  type SchoolAIMessageEntry,
} from "@/lib/school/school-ai-actions";

/** Strips the diagram blocks before speaking — nobody wants SVG read aloud. */
function speakableText(content: string): string {
  return content.replace(/```svg[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
}

function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function SchoolAIPanel({ initialMessages }: { initialMessages: SchoolAIMessageEntry[] }) {
  const [messages, setMessages] = useState<SchoolAIMessageEntry[]>(initialMessages);
  const [input, setInput] = useState("");
  // Photos already on the server but not yet attached to a message.
  const [staged, setStaged] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const spokenRef = useRef<string | null>(null);

  const mic = useSpeechRecognition();

  useEffect(() => setCanSpeak(speechSupported()), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  // Dictation fills the box you'd type in, so a misheard word is fixable before
  // it is sent. Only while listening: a final result can land just after Stop.
  useEffect(() => {
    if (mic.listening && mic.transcript) setInput(mic.transcript);
  }, [mic.transcript, mic.listening]);

  function send(text: string) {
    const trimmed = text.trim();
    if ((!trimmed && staged.length === 0) || pending || uploading) return;
    const photos = staged;
    setInput("");
    setStaged([]);
    setNotice(null);
    mic.reset();
    setMessages((prev) => [
      ...prev,
      {
        id: `pending-${Date.now()}`,
        role: "USER",
        content: trimmed || "(sent photos without a question)",
        imagePaths: photos,
        createdAt: new Date(),
      },
    ]);
    startTransition(async () => setMessages(await sendSchoolAIMessage(trimmed, photos)));
  }

  /**
   * One photo per call, not one call per batch.
   *
   * Twelve phone photos in a single request is tens of megabytes, and a
   * Server Action body has a hard limit — one that a batch would have to be
   * absurdly large to clear. One at a time keeps every request the size of a
   * single photo, and a long batch shows progress instead of one silent wait.
   */
  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_PHOTOS_PER_MESSAGE - staged.length;
    if (room <= 0) {
      setNotice(`${MAX_PHOTOS_PER_MESSAGE} photos is the most one question can carry — send these, then add the rest.`);
      return;
    }

    const chosen = Array.from(files).slice(0, room);
    setUploading(true);
    setNotice(chosen.length > 1 ? `Uploading 1 of ${chosen.length}…` : null);
    const problems: string[] = [];

    for (const [index, file] of chosen.entries()) {
      if (chosen.length > 1) setNotice(`Uploading ${index + 1} of ${chosen.length}…`);
      const formData = new FormData();
      formData.append("photos", file);
      try {
        const result = await uploadSchoolAIPhotos(formData);
        if (result.paths.length > 0) setStaged((prev) => [...prev, ...result.paths]);
        if (result.error) problems.push(result.error);
      } catch {
        // The upload reached the server and was refused, or never got there.
        // Either way, naming the photo is the useful part — blaming the
        // connection is a guess, and usually a wrong one.
        problems.push(`${file.name || "One photo"} couldn't be uploaded. If it's very large, try a smaller one.`);
      }
    }

    setUploading(false);
    setNotice(problems.length > 0 ? problems.join(" ") : null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeStaged(path: string) {
    setStaged((prev) => prev.filter((p) => p !== path));
    void discardSchoolAIPhoto(path);
  }

  function toggleMic() {
    if (mic.listening) {
      mic.stop();
      // Stopping is how you finish a spoken turn, so send what was heard.
      const heard = (mic.transcript || input).trim();
      if (heard || staged.length > 0) send(heard);
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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={mic.listening ? "secondary" : "outline"}
            onClick={toggleMic}
            disabled={!mic.supported || pending}
            title={mic.supported ? "Ask out loud" : "This browser has no speech recognition"}
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
            title={canSpeak ? "Read answers out loud" : "This browser can't speak"}
          >
            {speakReplies ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {speakReplies ? "Speaking" : "Speak answers"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || pending}
            title="Photograph a question, your notes, or your own working"
          >
            <ImagePlus size={14} />
            {uploading ? "Uploading…" : "Photos"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={PHOTO_ACCEPT}
            multiple
            className="hidden"
            data-testid="school-ai-photo-input"
            onChange={(e) => void addPhotos(e.target.files)}
          />
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => startTransition(async () => setMessages(await clearSchoolAIChat()))}
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
          🎙 Listening… {mic.interim || "ask your question, then press Stop & send."}
        </p>
      )}
      {mic.error && <p className="mb-2 text-xs text-danger">{mic.error}</p>}
      {notice && <p className={`mb-2 text-xs ${uploading ? "text-muted" : "text-danger"}`}>{notice}</p>}
      {!mic.supported && (
        <p className="mb-2 text-xs text-muted">
          Voice input needs Chrome, Edge or Safari — this browser doesn&apos;t offer it, so type instead.
        </p>
      )}

      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center text-muted">
          <span className="text-3xl">🎓</span>
          <p className="max-w-md text-sm">
            This one only does school — Cambridge IGCSE and A Level. Press <strong>Talk</strong> and ask, or photograph
            a question, your notes, or your own attempt and send up to {MAX_PHOTOS_PER_MESSAGE} pictures at once.
          </p>
        </div>
      ) : (
        <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto py-2">
          {messages.map((m) => (
            <div key={m.id} className={`flex flex-col gap-1 ${m.role === "USER" ? "items-end" : "items-start"}`}>
              {m.imagePaths.length > 0 && (
                <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                  {m.imagePaths.map((path) => (
                    <a key={path} href={path} target="_blank" rel="noreferrer">
                      <Image
                        src={path}
                        alt="Photo sent to your school AI"
                        width={96}
                        height={96}
                        unoptimized
                        className="h-20 w-20 rounded-lg border border-border object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
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
          {pending && <p className="text-xs text-muted">Reading and thinking…</p>}
        </div>
      )}

      {staged.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2" data-testid="school-ai-staged">
          {staged.map((path) => (
            <div key={path} className="relative">
              <Image
                src={path}
                alt="Photo ready to send"
                width={64}
                height={64}
                unoptimized
                className="h-16 w-16 rounded-lg border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => removeStaged(path)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-surface p-0.5 text-muted shadow ring-1 ring-border hover:text-danger"
                title="Remove this photo"
              >
                <X size={12} />
              </button>
            </div>
          ))}
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
          placeholder="Ask anything about a subject, a past paper, or your revision…"
          disabled={pending}
          className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
        />
        <Button type="submit" size="md" disabled={pending || uploading || (!input.trim() && staged.length === 0)}>
          <Send size={16} />
        </Button>
      </form>
    </div>
  );
}
