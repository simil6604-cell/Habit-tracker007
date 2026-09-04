import Link from "next/link";
import { ProgressBar } from "@/components/ui/progress-bar";

export function SubjectCard({
  subject,
}: {
  subject: { id: string; name: string; color: string; teacher: string | null; room: string | null; avgProgress: number; topicCount: number };
}) {
  return (
    <Link
      href={`/school/subjects/${subject.id}`}
      className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: subject.color }} />
        <p className="font-semibold">{subject.name}</p>
      </div>
      {(subject.teacher || subject.room) && (
        <p className="text-xs text-muted">
          {subject.teacher}
          {subject.teacher && subject.room ? " · " : ""}
          {subject.room ? `Room ${subject.room}` : ""}
        </p>
      )}
      <ProgressBar value={subject.avgProgress} colorClassName="bg-cat-school" />
      <p className="text-xs text-muted">
        {subject.avgProgress}% overall · {subject.topicCount} topic{subject.topicCount === 1 ? "" : "s"}
      </p>
    </Link>
  );
}
