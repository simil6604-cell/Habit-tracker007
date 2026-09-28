"use client";

import { useTransition } from "react";
import { moveLibraryItem } from "@/lib/library/library-actions";

/**
 * Files one item on a shelf.
 *
 * A plain select that submits on change, rather than a drag-and-drop target:
 * this page gets used on a phone at least as often as on a laptop, and
 * dragging a card into a folder with a thumb is a coin toss.
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
  folders,
}: {
  itemId: string;
  itemTitle: string;
  folderId: string | null;
  folders: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();

  if (folders.length === 0) return null;

  return (
    <select
      name="folderId"
      defaultValue={folderId ?? ""}
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
      className="max-w-[9rem] truncate rounded-lg border border-border bg-surface px-2 py-1 text-xs text-muted disabled:opacity-50"
    >
      <option value="">No folder</option>
      {folders.map((folder) => (
        <option key={folder.id} value={folder.id}>{folder.name}</option>
      ))}
    </select>
  );
}
