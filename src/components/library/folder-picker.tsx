"use client";

import { Fragment, useTransition } from "react";
import { moveLibraryItem } from "@/lib/library/library-actions";

export type PickerFolder = { id: string; name: string; sections: { id: string; name: string }[] };

/**
 * Files one item on a shelf — and, when the folder has dividers, into one of
 * them.
 *
 * A plain select that submits on change, rather than a drag-and-drop target:
 * this page gets used on a phone at least as often as on a laptop, and
 * dragging a card into a folder with a thumb is a coin toss.
 *
 * One control for both levels: the folder on its own, then each of its
 * sections under it. The folder itself stays in the list, so "Biology, but
 * not in any section" is still reachable — otherwise adding sections to a
 * folder would take away the ability to just put something in it.
 *
 * Every section entry carries its folder's name rather than sitting in an
 * <optgroup>, because a closed select shows only the chosen option: five
 * subjects each have a "Lesson notes", and a card reading just that does not
 * say which subject it is filed under.
 *
 * It is a client component purely so the change handler can call the action.
 * The first version did it with an inline <script> injected through
 * dangerouslySetInnerHTML — static text with nothing user-supplied in it, so
 * not an injection, but inline script is the kind of thing that gets copied
 * later into a place where the string is not static.
 */
export function FolderPicker({
  itemId,
  itemTitle,
  folderId,
  sectionId,
  folders,
}: {
  itemId: string;
  itemTitle: string;
  folderId: string | null;
  sectionId: string | null;
  folders: PickerFolder[];
}) {
  const [pending, startTransition] = useTransition();

  if (folders.length === 0) return null;

  // The value carries both levels: "" is unfiled, a bare id is the folder
  // itself, "folder:section" is one of its dividers.
  const current = folderId ? (sectionId ? `${folderId}:${sectionId}` : folderId) : "";

  return (
    <select
      name="folderId"
      defaultValue={current}
      disabled={pending}
      aria-label={`Folder for ${itemTitle}`}
      data-testid={`folder-picker-${itemId}`}
      onChange={(event) => {
        const formData = new FormData();
        formData.set("folderId", event.target.value);
        startTransition(() => {
          void moveLibraryItem(itemId, formData);
        });
      }}
      className="max-w-[13rem] truncate rounded-lg border border-border bg-surface px-2 py-1 text-xs text-muted disabled:opacity-50"
    >
      <option value="">No folder</option>
      {folders.map((folder) => (
        <Fragment key={folder.id}>
          <option value={folder.id}>{folder.name}</option>
          {folder.sections.map((section) => (
            <option key={section.id} value={`${folder.id}:${section.id}`}>
              {folder.name} › {section.name}
            </option>
          ))}
        </Fragment>
      ))}
    </select>
  );
}
