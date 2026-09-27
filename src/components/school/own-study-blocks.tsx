import { format } from "date-fns";
import { deleteStudyBlock, toggleStudyBlockDone } from "@/lib/school/planner-actions";

export type OwnBlock = {
  id: string;
  title: string;
  subjectName: string | null;
  start: Date;
  end: Date;
  completed: boolean;
  aiGenerated: boolean;
};

/**
 * The blocks that are really in the calendar — the ones written here by hand
 * and the ones committed from a suggestion — as opposed to today's proposal,
 * which is recomputed on every visit and exists only on screen.
 */
export function OwnStudyBlocks({ blocks }: { blocks: OwnBlock[] }) {
  if (blocks.length === 0) {
    return <p className="text-sm text-muted">Nothing written down for this day yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border" data-testid="own-blocks">
      {blocks.map((block) => (
        <li key={block.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
          <form action={toggleStudyBlockDone.bind(null, block.id)}>
            <button
              type="submit"
              aria-label={block.completed ? `Mark "${block.title}" as not done` : `Mark "${block.title}" as done`}
              className="flex h-5 w-5 items-center justify-center rounded-md border border-border text-xs"
            >
              {block.completed ? "✓" : ""}
            </button>
          </form>

          <span className={block.completed ? "text-muted line-through" : "font-medium"}>
            {format(block.start, "HH:mm")}–{format(block.end, "HH:mm")} {block.title}
          </span>

          {block.subjectName && (
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">{block.subjectName}</span>
          )}
          {block.aiGenerated && <span className="text-xs text-muted">from a suggestion</span>}

          <form action={deleteStudyBlock.bind(null, block.id)} className="ml-auto">
            <button
              type="submit"
              title={`Delete "${block.title}"`}
              aria-label={`Delete "${block.title}"`}
              className="text-xs text-muted transition hover:text-danger"
            >
              ✕
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
