"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getTutorMessages,
  sendTutorMessage,
  startTutorTopic,
  clearTutorChat,
  type TutorMessageEntry,
} from "@/lib/school/tutor-actions";
import { sanitizeSvg } from "@/lib/utils/sanitize-svg";

function SvgDiagram({ code }: { code: string }) {
  const [safeHtml, setSafeHtml] = useState<string | null>(null);
  useEffect(() => {
    setSafeHtml(sanitizeSvg(code));
  }, [code]);
  if (!safeHtml) return null;
  return (
    <div
      className="mt-2 rounded-lg border border-border bg-white p-2"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}

function MessageContent({ content }: { content: string }) {
  const parts: { type: "text" | "svg"; value: string }[] = [];
  const regex = /```svg\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    parts.push({ type: "svg", value: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) parts.push({ type: "text", value: content.slice(lastIndex) });

  return (
    <>
      {parts.map((p, i) =>
        p.type === "text" ? (
          p.value.trim() && <p key={i} className="whitespace-pre-wrap text-sm">{p.value.trim()}</p>
        ) : (
          <SvgDiagram key={i} code={p.value} />
        )
      )}
    </>
  );
}

export function TutorChatPanel({ topicId }: { topicId: string }) {
  const [messages, setMessages] = useState<TutorMessageEntry[] | null>(null);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startTransition(async () => setMessages(await getTutorMessages(topicId)));
  }, [topicId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function optimisticallyAppend(content: string) {
    const optimistic: TutorMessageEntry = { id: `pending-${Date.now()}`, role: "USER", content, createdAt: new Date() };
    setMessages((prev) => [...(prev ?? []), optimistic]);
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setInput("");
    optimisticallyAppend(trimmed);
    startTransition(async () => setMessages(await sendTutorMessage(topicId, trimmed)));
  }

  function quickStart(kind: "explain" | "exam") {
    optimisticallyAppend(
      kind === "explain"
        ? "Can you explain this topic to me, step by step, the way you'd introduce it to someone learning it for the first time?"
        : "What do I specifically need to know about this topic for the exam?"
    );
    startTransition(async () => setMessages(await startTutorTopic(topicId, kind)));
  }

  function clear() {
    startTransition(async () => setMessages(await clearTutorChat(topicId)));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <Sparkles size={13} className="text-accent" /> AI Tutor — a real back-and-forth conversation
        </p>
        {messages && messages.length > 0 && (
          <button onClick={clear} disabled={pending} className="text-muted hover:text-danger" title="Clear conversation">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {messages === null ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : messages.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          <p className="text-xs text-muted">
            Start a conversation — ask anything, or use a quick start. When a diagram genuinely helps explain
            something, the tutor draws one.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => quickStart("explain")}>
              Explain this topic
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => quickStart("exam")}>
              What do I need for the exam?
            </Button>
          </div>
        </div>
      ) : (
        <div ref={scrollRef} className="flex max-h-96 flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-surface p-3">
          {messages.map((m) => (
            <div key={m.id} className={`flex flex-col gap-1 ${m.role === "USER" ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 ${
                  m.role === "USER" ? "bg-accent text-accent-foreground" : "bg-surface-muted text-foreground"
                }`}
              >
                <MessageContent content={m.content} />
              </div>
              <span className="text-[10px] text-muted">{format(m.createdAt, "HH:mm")}</span>
            </div>
          ))}
          {pending && <p className="text-xs text-muted">Tutor is thinking…</p>}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about this topic…"
          disabled={pending}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <Button type="submit" size="sm" disabled={pending || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
