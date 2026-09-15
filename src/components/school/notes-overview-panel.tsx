import Link from "next/link";
import { format } from "date-fns";
import type { NoteOverviewEntry } from "@/lib/school/notes-overview";

export function NotesOverviewPanel({ entries }: { entries: NoteOverviewEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted">
        No notes yet. Open a subject, expand a topic with the ✨ button, then add note photos or record a lesson —
        they all show up here afterwards.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((e) => (
        <li key={`${e.kind}-${e.id}`} className="rounded-lg border border-border bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: e.subjectColor }} />
            <span className="text-xs font-medium">{e.kind === "PHOTO" ? "📷 Note photo" : "🎙️ Class recording"}</span>
            <span className="text-xs text-muted">
              {e.subjectName} · {e.topicName}
            </span>
            <span className="ml-auto text-[11px] text-muted">{format(e.createdAt, "MMM d, HH:mm")}</span>
          </div>

          <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm text-muted">
            {e.summary ?? "No AI summary yet — connect an AI in Settings and re-summarize from the topic."}
          </p>

          <Link
            href={`/school/subjects/${e.subjectId}`}
            className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
          >
            Open topic to revise or be quizzed →
          </Link>
        </li>
      ))}
    </ul>
  );
}
