"use client";

import { useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { Check, ChevronDown, MessageSquare, Mic, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_CHAT_TITLE } from "@/lib/school/chat-titles";
import type { SchoolAIChatSummary } from "@/lib/school/school-ai-actions";
import type { LessonEntry } from "@/lib/school/class-recording-actions";
import { formatLength, lessonLabel } from "@/lib/school/lesson-notes";

/**
 * Everything that has been asked and everything that has been recorded, in
 * one list, with names you write yourself.
 *
 * Asked for with a picture of Claude's own sidebar. Two decisions came out of
 * that picture. The questions and the recordings belong in the same list —
 * "the history of the audio and the questions" was one sentence, and a
 * student looking for last Tuesday does not care which of the two it was.
 * And the names are theirs: a typed title always wins over the one the app
 * derives from the first question, which is never written down and so can
 * never get in the way of renaming.
 */

type Props = {
  chats: SchoolAIChatSummary[];
  lessons: LessonEntry[];
  activeChatId: string | null;
  busy: boolean;
  onOpenChat: (id: string) => void;
  onNewChat: () => void;
  onRenameChat: (id: string, title: string) => void;
  onDeleteChat: (id: string) => void;
  onRenameLesson: (id: string, title: string) => void;
  onOpenLesson: (id: string) => void;
};

/** "Today", "Yesterday", then the date — the way a list of days reads. */
function when(date: Date): string {
  if (isToday(date)) return `Today, ${format(date, "HH:mm")}`;
  if (isYesterday(date)) return `Yesterday, ${format(date, "HH:mm")}`;
  return format(date, "d MMM, HH:mm");
}

function Row({
  icon,
  label,
  detail,
  active,
  busy,
  onOpen,
  onRename,
  onDelete,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  active?: boolean;
  busy: boolean;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  if (editing) {
    return (
      <form
        className="flex items-center gap-1.5 rounded-lg border border-accent/50 bg-surface p-2"
        onSubmit={(e) => {
          e.preventDefault();
          onRename(draft);
          setEditing(false);
        }}
      >
        <input
          autoFocus
          value={draft}
          maxLength={MAX_CHAT_TITLE}
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          data-testid="history-rename-input"
          aria-label="Name for this"
        />
        <button type="submit" aria-label="Save this name" className="text-muted hover:text-accent" data-testid="history-rename-save">
          <Check size={14} />
        </button>
        <button
          type="button"
          aria-label="Keep the old name"
          onClick={() => {
            setDraft(label);
            setEditing(false);
          }}
          className="text-muted hover:text-danger"
        >
          <X size={14} />
        </button>
      </form>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border p-2 ${
        active ? "border-accent/60 bg-accent/10" : "border-border bg-surface"
      }`}
      data-testid="history-row"
    >
      <span className="shrink-0 text-muted">{icon}</span>
      <button type="button" onClick={onOpen} disabled={busy} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm">{label}</span>
        <span className="block text-[11px] text-muted">{detail}</span>
      </button>
      <button
        type="button"
        aria-label={`Rename ${label}`}
        onClick={() => {
          setDraft(label);
          setEditing(true);
        }}
        className="shrink-0 text-muted hover:text-accent"
        data-testid="history-rename"
      >
        <Pencil size={13} />
      </button>
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${label}`}
          onClick={onDelete}
          disabled={busy}
          className="shrink-0 text-muted hover:text-danger"
          data-testid="history-delete"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

export function ChatHistory({
  chats,
  lessons,
  activeChatId,
  busy,
  onOpenChat,
  onNewChat,
  onRenameChat,
  onDeleteChat,
  onRenameLesson,
  onOpenLesson,
}: Props) {
  const [open, setOpen] = useState(false);
  const total = chats.length + lessons.length;

  return (
    <div className="mb-2 rounded-2xl border border-border bg-surface-muted p-3" data-testid="chat-history">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          data-testid="chat-history-toggle"
        >
          <MessageSquare className="h-4 w-4 shrink-0 text-accent" />
          <span className="truncate text-sm font-medium">
            Your chats and recordings
            {total > 0 && <span className="ml-1.5 font-normal text-muted">{total}</span>}
          </span>
          <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <Button size="sm" variant="outline" onClick={onNewChat} disabled={busy} data-testid="new-chat">
          <Plus className="mr-1 h-3.5 w-3.5" />
          New chat
        </Button>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-1.5">
          {total === 0 && (
            <p className="text-xs text-muted">
              Nothing here yet. Ask something, or record a lesson, and it will be kept here with a name you can
              change.
            </p>
          )}

          {chats.map((chat) => (
            <Row
              key={chat.id}
              icon={<MessageSquare size={14} />}
              label={chat.label}
              detail={`${when(chat.updatedAt)} · ${chat.messageCount} ${chat.messageCount === 1 ? "message" : "messages"}`}
              active={chat.id === activeChatId}
              busy={busy}
              onOpen={() => onOpenChat(chat.id)}
              onRename={(title) => onRenameChat(chat.id, title)}
              onDelete={() => onDeleteChat(chat.id)}
            />
          ))}

          {lessons.map((lesson) => {
            const length = formatLength(lesson.recordedSeconds);
            return (
              <Row
                key={lesson.id}
                icon={<Mic size={14} />}
                label={lessonLabel(lesson)}
                detail={`${when(lesson.createdAt)}${length ? ` · ${length}` : ""}${lesson.notes ? " · notes made" : " · no notes yet"}`}
                busy={busy}
                onOpen={() => onOpenLesson(lesson.id)}
                onRename={(title) => onRenameLesson(lesson.id, title)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
