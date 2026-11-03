"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { Check, Pencil, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  createLibrarySection,
  deleteLibrarySection,
  renameLibrarySection,
  type FolderFormState,
} from "@/lib/library/library-actions";
import { MAX_FOLDER_NAME } from "@/lib/library/library";
import type { LibrarySectionRow } from "@/lib/library/library-data";

/**
 * The dividers inside one folder — the middle level of notebook → section →
 * page.
 *
 * Only the open folder's sections are shown. Every folder's sections at once
 * would be a wall of chips with no way to tell which subject each belongs to,
 * and the picture this was asked from shows exactly one notebook open at a
 * time.
 *
 * "Not in a section" is not decoration: the moment one thing is filed into a
 * section, everything else in the folder would otherwise be invisible unless
 * you knew to clear the filter, which looks like the folder lost them.
 */
export function LibrarySections({
  folderId,
  folderName,
  sections,
  activeSectionId,
  unsortedCount,
}: {
  folderId: string;
  folderName: string;
  sections: LibrarySectionRow[];
  activeSectionId: string | null;
  unsortedCount: number;
}) {
  const [state, formAction, pending] = useActionState<FolderFormState, FormData>(
    createLibrarySection.bind(null, folderId),
    undefined
  );
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-muted/40 px-4 py-3" data-testid="library-sections">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight">
          Sections in {folderName}
        </h3>
        {!open && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)} data-testid="new-section">
            <Plus size={14} /> New section
          </Button>
        )}
      </div>

      {sections.length === 0 && !open && (
        <p className="text-sm text-muted">
          No sections yet. Add one — &ldquo;Lesson notes&rdquo;, &ldquo;Corrections&rdquo; — to split this
          folder up.
        </p>
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
          data-testid="create-section-form"
        >
          <div className="flex flex-wrap gap-2">
            <input
              name="name"
              required
              autoFocus
              autoComplete="off"
              maxLength={MAX_FOLDER_NAME}
              placeholder="Section name"
              aria-label="Section name"
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={pending}>
              {pending ? "Adding…" : "Add section"}
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

      <div className="flex flex-wrap items-center gap-2">
        <SectionChip
          href={`/library?folder=${folderId}`}
          label={`All of ${folderName}`}
          count={null}
          active={activeSectionId === null}
        />
        {sections.map((section) =>
          renaming === section.id ? (
            <form
              key={section.id}
              action={async (formData) => {
                await renameLibrarySection(section.id, formData);
                setRenaming(null);
              }}
              className="flex items-center gap-1 rounded-full border border-accent bg-surface px-2 py-1"
              data-testid={`section-rename-form-${section.id}`}
            >
              <input
                name="name"
                defaultValue={section.name}
                required
                autoFocus
                maxLength={MAX_FOLDER_NAME}
                aria-label={`Rename section ${section.name}`}
                className="w-32 min-w-0 bg-transparent text-xs outline-none"
              />
              <button type="submit" aria-label="Save section name" className="text-muted transition hover:text-accent">
                <Check size={13} />
              </button>
              <button
                type="button"
                aria-label="Cancel renaming"
                onClick={() => setRenaming(null)}
                className="text-muted transition hover:text-danger"
              >
                <X size={13} />
              </button>
            </form>
          ) : (
            <div
              key={section.id}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 transition",
                activeSectionId === section.id
                  ? "border-accent bg-accent/10"
                  : "border-border bg-surface hover:border-accent/50"
              )}
            >
              <Link
                href={`/library?folder=${folderId}&section=${section.id}`}
                className="flex min-w-0 items-center gap-1.5 text-xs font-medium"
                data-testid={`section-chip-${section.id}`}
              >
                <span className="truncate">{section.name}</span>
                <span className="tabular-nums text-muted">{section.count}</span>
              </Link>
              <button
                type="button"
                aria-label={`Rename section ${section.name}`}
                title={`Rename section ${section.name}`}
                onClick={() => setRenaming(section.id)}
                className="text-muted transition hover:text-accent"
              >
                <Pencil size={12} />
              </button>
              <form
                action={deleteLibrarySection.bind(null, section.id)}
                onSubmit={(event) => {
                  if (
                    !confirm(
                      `Delete the section "${section.name}"?\n\nThe ${section.count} item(s) in it are NOT deleted — they stay in ${folderName} and become unsorted.`
                    )
                  ) {
                    event.preventDefault();
                  }
                }}
              >
                <button
                  type="submit"
                  aria-label={`Delete section ${section.name}`}
                  title={`Delete section ${section.name}`}
                  className="text-muted transition hover:text-danger"
                >
                  <X size={12} />
                </button>
              </form>
            </div>
          )
        )}
        {sections.length > 0 && (
          <SectionChip
            href={`/library?folder=${folderId}&section=UNSORTED`}
            label="Not in a section"
            count={unsortedCount}
            active={activeSectionId === "UNSORTED"}
          />
        )}
      </div>
    </section>
  );
}

function SectionChip({
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
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
        active ? "border-accent bg-accent/10" : "border-border bg-surface hover:border-accent/50"
      )}
    >
      <span className="truncate">{label}</span>
      {count !== null && <span className="tabular-nums text-muted">{count}</span>}
    </Link>
  );
}
