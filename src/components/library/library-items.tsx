import Link from "next/link";
import { format } from "date-fns";
import { FolderPicker } from "./folder-picker";
import type { LibraryItem, LibraryView } from "@/lib/library/library";
import type { LibraryFolderRow } from "@/lib/library/library-data";

const TYPE_ICON: Record<LibraryItem["type"], string> = {
  FLASHCARD: "🗂️",
  NOTE: "📝",
  RECORDING: "🎙️",
};

export function LibraryItems({
  items,
  folders,
  view,
}: {
  items: LibraryItem[];
  folders: LibraryFolderRow[];
  view: LibraryView;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
        <p className="text-sm font-medium">Nothing here yet</p>
        <p className="mt-1 text-sm text-muted">
          Flashcards, photographed notes, what you wrote in a topic and class recordings all land here
          automatically — make one anywhere in School and it shows up.
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        view === "GRID"
          ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          : "flex flex-col gap-2"
      }
      data-testid="library-items"
    >
      {items.map((item) => (
        <article
          key={item.id}
          data-testid={`library-item-${item.id}`}
          className={
            view === "GRID"
              ? "flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 transition hover:border-accent/60"
              : "flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition hover:border-accent/60"
          }
        >
          <div className={view === "GRID" ? "flex items-center gap-2" : "flex items-center gap-2"}>
            <span aria-hidden className="text-base">{TYPE_ICON[item.type]}</span>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted">
              {item.kind}
            </span>
          </div>

          <Link href={item.href} className={view === "GRID" ? "min-w-0" : "min-w-0 flex-1"}>
            <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
            {item.detail && <p className="line-clamp-2 text-xs text-muted">{item.detail}</p>}
          </Link>

          <div className={view === "GRID" ? "mt-auto flex flex-wrap items-center gap-2 pt-1" : "flex items-center gap-2"}>
            {item.context && <span className="truncate text-xs text-muted">{item.context}</span>}
            <span className="text-xs text-muted">{format(item.createdAt, "d MMM yyyy")}</span>
            <div className="ml-auto">
              <FolderPicker
                itemId={item.id}
                itemTitle={item.title}
                folderId={item.folderId}
                folders={folders}
              />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
