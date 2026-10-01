"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { addFootballLink, deleteFootballLink, type SaveLinkState } from "@/lib/football/link-actions";
import { LINK_KINDS, linkSubtitle, orderLinks, type StoredLink } from "@/lib/football/links";
import { Button } from "@/components/ui/button";

/**
 * The league's own pages, as buttons.
 *
 * This is the route that cannot fail for a reason outside the app. The
 * importer below asks this server to fetch the table, and a league site is
 * free to refuse it — matchcenter.el-pl.ch answers 403 to anything that is not
 * a browser. Your phone is a browser, so a link always works.
 */
export function LeagueLinksPanel({ links }: { links: StoredLink[] }) {
  const [state, formAction] = useActionState(addFootballLink, null);
  const [open, setOpen] = useState(links.length === 0);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  // React 19 resets a form after its action runs, which wipes the kind you
  // picked even when the save failed and the form is still on screen. The
  // controlled fields survive that on their own; the select has to be put back.
  //
  // Once per save, and no more. The first version ran whenever `kind` changed
  // too, and `state` still held the last success — so picking the kind for the
  // second link emptied the address that had just been pasted for it. Keeping
  // the state object that was already dealt with is what makes it once: a new
  // submit returns a new object, a re-render for any other reason does not.
  const [kind, setKind] = useState<string>("TABLE");
  const handled = useRef<SaveLinkState>(null);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    const select = formRef.current?.elements.namedItem("kind");
    if (select instanceof HTMLSelectElement) select.value = kind;
    if (!state.ok) return;
    setUrl("");
    setTitle("");
  }, [state, kind]);

  const ordered = orderLinks(links);

  return (
    <div className="flex flex-col gap-3" data-testid="league-links">
      {ordered.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {ordered.map((link) => (
            <div key={link.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted p-2">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 hover:bg-surface"
              >
                <ExternalLink size={14} className="shrink-0 text-accent" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{link.title}</span>
                  <span className="block truncate text-xs text-muted">{linkSubtitle(link)}</span>
                </span>
              </a>
              <form action={deleteFootballLink}>
                <input type="hidden" name="id" value={link.id} />
                <button type="submit" aria-label={`Remove ${link.title}`} className="text-muted hover:text-danger">
                  <Trash2 size={14} />
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <form ref={formRef} action={formAction} className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <p className="text-xs text-muted">
            Open your league page in the browser, copy the address, and paste it here. Nothing is downloaded — the
            button just takes you there, which is why it works for pages this app cannot read itself.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              name="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="text"
              inputMode="url"
              required
              placeholder="https://matchcenter.el-pl.ch/…"
              aria-label="Link to the page"
              className="min-w-[14rem] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <select
              name="kind"
              defaultValue={kind}
              onChange={(e) => setKind(e.target.value)}
              aria-label="What this page shows"
              className="rounded-lg border border-border bg-surface px-2 py-2 text-sm"
            >
              {LINK_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Name it (optional — the site's name is used otherwise)"
              aria-label="Name for this link"
              className="min-w-[14rem] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <Button type="submit" size="sm" variant="secondary">
              <Plus size={14} /> Save link
            </Button>
            {links.length > 0 && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Done
              </Button>
            )}
          </div>
          {state && !state.ok && (
            <p role="alert" className="text-xs text-danger">
              {state.error}
            </p>
          )}
          {state?.ok && (
            <p role="status" className="text-xs text-success">
              Saved. It is in the list above — add the next one if you have it.
            </p>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="add-league-link"
          className="self-start text-xs text-accent underline-offset-2 hover:underline"
        >
          + Add another league page
        </button>
      )}
    </div>
  );
}
