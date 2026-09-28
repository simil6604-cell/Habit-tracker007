"use client";

import { useActionState, useRef, useState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addRevisionLink, deleteRevisionLink, type LinkFormState } from "@/lib/school/revision-link-actions";
import { detectKind, detectProvider, REVISION_KINDS, type StoredLink } from "@/lib/school/revision-links";

const KIND_LABEL: Record<string, string> = Object.fromEntries(REVISION_KINDS.map((k) => [k.value, k.label]));
const KIND_ICON: Record<string, string> = {
  FLASHCARDS: "🃏",
  NOTES: "📖",
  QUESTIONS: "❓",
  PAST_PAPERS: "📄",
  OTHER: "🔗",
};

const FIELD = "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";

/**
 * The pages and decks you actually revise from.
 *
 * Links and nothing else. Save My Exams is a paid product and a Carousel deck
 * belongs to whoever built it — this app stores the address, never opens the
 * page, and says so where the school AI can read it too.
 */
export function RevisionLinksPanel({
  links,
  subjects,
  defaultSubjectId,
}: {
  links: StoredLink[];
  subjects: { id: string; name: string; topics: { id: string; name: string }[] }[];
  /** Pre-selects a subject when this panel sits on that subject's page. */
  defaultSubjectId?: string;
}) {
  const [state, formAction, pending] = useActionState<LinkFormState, FormData>(addRevisionLink, undefined);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? "");
  const formRef = useRef<HTMLFormElement>(null);

  // The guess follows what you paste, and is only ever the starting value of
  // the picker — whatever you choose there wins.
  const guessedKind = url ? detectKind(url) : "OTHER";
  const provider = url ? detectProvider(url) : null;
  const topics = subjects.find((s) => s.id === subjectId)?.topics ?? [];

  const decks = links.filter((link) => link.kind === "FLASHCARDS");
  const rest = links.filter((link) => link.kind !== "FLASHCARDS");

  return (
    <div className="flex flex-col gap-4">
      {links.length === 0 && !open && (
        <div className="rounded-2xl border border-dashed border-border px-5 py-6">
          <p className="text-sm font-medium">Nothing saved yet</p>
          <p className="mt-1 text-sm text-muted">
            Paste the deck or page you actually revise from — a Carousel Learning quiz your teacher set, a Save My
            Exams topic page, anything. The app keeps the link and never opens the page, so nothing of theirs is
            copied in here.
          </p>
        </div>
      )}

      {decks.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Flashcard decks</p>
          <LinkList links={decks} />
        </div>
      )}

      {rest.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Notes, questions and papers</p>
          <LinkList links={rest} />
        </div>
      )}

      {open ? (
        <form
          ref={formRef}
          action={async (formData) => {
            await formAction(formData);
            setUrl("");
            const title = formRef.current?.elements.namedItem("title");
            if (title instanceof HTMLInputElement) title.value = "";
          }}
          className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-muted p-4"
          data-testid="add-revision-link"
        >
          <input
            name="url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://app.carousel-learning.com/quiz/…/revise"
            aria-label="Link"
            className={FIELD}
          />
          {provider && (
            <p className="text-xs text-muted">
              Recognised as <span className="font-medium text-foreground">{provider}</span>
              {guessedKind === "FLASHCARDS" && " — a flashcard deck"}. You can change what it is below.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <input
              name="title"
              placeholder="What is it? (optional)"
              aria-label="Name"
              autoComplete="off"
              className={`min-w-0 flex-1 ${FIELD}`}
            />
            <select name="kind" aria-label="What kind of link" key={guessedKind} defaultValue={guessedKind} className={FIELD}>
              {REVISION_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>{kind.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              name="subjectId"
              aria-label="Subject"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className={FIELD}
            >
              <option value="">No subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select name="topicId" aria-label="Topic" defaultValue="" className={FIELD} disabled={topics.length === 0}>
              <option value="">{topics.length === 0 ? "No topics" : "Whole subject"}</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="secondary" disabled={pending}>
              {pending ? "Saving…" : "Save link"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>

          {state?.error && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{state.error}</p>
          )}
        </form>
      ) : (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setOpen(true)}>
          <Plus size={14} /> Add a link
        </Button>
      )}

      <p className="text-xs text-muted">
        Your school AI is told which of these you have and will send you to them — it is also told, in as many
        words, that it has not read them, so it can never summarise a page it has never seen.
      </p>
    </div>
  );
}

function LinkList({ links }: { links: StoredLink[] }) {
  return (
    <ul className="flex flex-col gap-2" data-testid="revision-links">
      {links.map((link) => (
        <li
          key={link.id}
          data-testid={`revision-link-${link.id}`}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5"
        >
          <span aria-hidden className="text-base">{KIND_ICON[link.kind] ?? "🔗"}</span>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 text-sm font-medium hover:underline"
          >
            {link.title}
            <span className="ml-2 text-xs font-normal text-muted">
              {detectProvider(link.url) ?? ""} · {KIND_LABEL[link.kind] ?? "Link"}
            </span>
          </a>
          <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${link.title}`}>
            <ExternalLink size={14} className="text-muted transition hover:text-foreground" />
          </a>
          <form action={deleteRevisionLink.bind(null, link.id)}>
            <button
              type="submit"
              aria-label={`Delete ${link.title}`}
              title={`Delete ${link.title}`}
              className="text-muted transition hover:text-danger"
            >
              <Trash2 size={14} />
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
