"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Folder, FolderOpen, Plus, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  createLibraryFolder,
  deleteLibraryFolder,
  setUpSubjectFolders,
  type FolderFormState,
} from "@/lib/library/library-actions";
import { MAX_FOLDER_NAME } from "@/lib/library/library";
import { STARTER_FOLDERS, STARTER_SECTIONS } from "@/lib/library/starter-structure";

export type FolderRow = { id: string; name: string; count: number; sections: { id: string }[] };

/**
 * The shelves, and the box that makes one.
 *
 * Deleting a folder only empties the shelf — the relation is SetNull, so
 * everything inside becomes unfiled again. The confirmation says that in those
 * words, because "delete folder" reads like it takes the contents with it and
 * nobody should have to find out the hard way which one it is.
 */
export function LibraryFolders({
  folders,
  activeFolderId,
  unfiledCount,
}: {
  folders: FolderRow[];
  activeFolderId: string | null;
  unfiledCount: number;
}) {
  const [state, formAction, pending] = useActionState<FolderFormState, FormData>(createLibraryFolder, undefined);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Folders</h2>
        <div className="flex flex-wrap items-center gap-2">
          <SetUpSubjects />
          {folders.length > 0 && !open && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus size={14} /> New folder
            </Button>
          )}
        </div>
      </div>

      {folders.length === 0 && !open && (
        <div className="rounded-2xl border border-dashed border-border px-5 py-6">
          <p className="text-sm font-medium">No folders yet</p>
          <p className="mt-1 text-sm text-muted">
            One folder per subject, with sections inside it — {STARTER_FOLDERS.join(", ")}, each split into{" "}
            {STARTER_SECTIONS.join(", ").toLowerCase()}. &ldquo;Set up my subjects&rdquo; builds all of it in one
            tap, and you can rename or delete any of it afterwards.
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setOpen(true)}>
            <Plus size={14} /> Create folder
          </Button>
        </div>
      )}

      {open && (
        <form
          ref={formRef}
          action={async (formData) => {
            await formAction(formData);
            const field = formRef.current?.elements.namedItem("name");
            if (field instanceof HTMLInputElement) {
              field.value = "";
              field.focus();
            }
          }}
          className="flex flex-col gap-2"
          data-testid="create-folder-form"
        >
          <div className="flex flex-wrap gap-2">
            <input
              name="name"
              required
              autoFocus
              autoComplete="off"
              maxLength={MAX_FOLDER_NAME}
              placeholder="Folder name — anything you like"
              aria-label="Folder name"
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={pending}>
              {pending ? "Creating…" : "Create folder"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {state?.error && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{state.error}</p>
          )}
        </form>
      )}

      {folders.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="library-folders">
          <FolderTile href="/library" label="Everything" count={null} active={activeFolderId === null} />
          <FolderTile
            href="/library?folder=UNFILED"
            label="Not in a folder"
            count={unfiledCount}
            active={activeFolderId === "UNFILED"}
          />
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 transition",
                activeFolderId === folder.id ? "border-accent bg-accent/10" : "border-border bg-surface hover:border-accent/50"
              )}
            >
              <Link href={`/library?folder=${folder.id}`} className="flex min-w-0 flex-1 items-center gap-2">
                {activeFolderId === folder.id ? <FolderOpen size={16} className="shrink-0 text-accent" /> : <Folder size={16} className="shrink-0 text-muted" />}
                <span className="truncate text-sm font-medium">{folder.name}</span>
                {folder.sections.length > 0 && (
                  <span className="shrink-0 text-[11px] text-muted">
                    {folder.sections.length} section{folder.sections.length === 1 ? "" : "s"}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">{folder.count}</span>
              </Link>
              <form
                action={deleteLibraryFolder.bind(null, folder.id)}
                onSubmit={(event) => {
                  if (
                    !confirm(
                      `Delete the folder "${folder.name}"?\n\nThe ${folder.count} item(s) inside it are NOT deleted — they go back to being unfiled.`
                    )
                  ) {
                    event.preventDefault();
                  }
                }}
              >
                <button
                  type="submit"
                  aria-label={`Delete folder ${folder.name}`}
                  title={`Delete folder ${folder.name}`}
                  className="text-muted transition hover:text-danger"
                >
                  <X size={14} />
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Builds the five subject folders and their sections in one tap.
 *
 * Safe to press twice: the action only adds what is missing, so the button
 * does not need to hide itself once the folders exist — and it stays useful
 * for a folder that was made by hand and has no sections yet.
 */
function SetUpSubjects() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        data-testid="set-up-subjects"
        onClick={() =>
          startTransition(async () => {
            const result = await setUpSubjectFolders();
            setDone(
              result.created === 0 && result.sections === 0
                ? "Already set up — nothing to add."
                : `Added ${result.created} folder${result.created === 1 ? "" : "s"} and ${result.sections} section${
                    result.sections === 1 ? "" : "s"
                  }.`
            );
          })
        }
      >
        <Sparkles size={14} /> {pending ? "Setting up…" : "Set up my subjects"}
      </Button>
      {done && (
        <p className="text-xs text-muted" role="status" data-testid="set-up-subjects-result">
          {done}
        </p>
      )}
    </div>
  );
}

function FolderTile({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number | null;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition",
        active ? "border-accent bg-accent/10" : "border-border bg-surface hover:border-accent/50"
      )}
    >
      <Folder size={16} className="shrink-0 text-muted" />
      <span className="truncate">{label}</span>
      {count !== null && <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">{count}</span>}
    </Link>
  );
}
