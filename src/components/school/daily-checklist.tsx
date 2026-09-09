import { toggleHomeworkStatus } from "@/lib/school/actions";
import { cycleTaskStatus } from "@/lib/tasks/actions";
import { Badge } from "@/components/ui/badge";
import type { DailyChecklistResult } from "@/lib/planner/day-review";
import { cn } from "@/lib/utils";

const KIND_EMOJI: Record<string, string> = { HOMEWORK: "📓", TASK: "✅", EXAM: "📝" };

export function DailyChecklist({ checklist }: { checklist: DailyChecklistResult }) {
  const { items, completedCount, totalCount, dayLabel } = checklist;

  if (totalCount === 0) {
    return <p className="text-sm text-muted">Nothing due today ({dayLabel}) — you&apos;re clear.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {completedCount}/{totalCount} done today ({dayLabel})
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="py-2.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2">
                {item.kind === "EXAM" ? (
                  <span>{KIND_EMOJI.EXAM}</span>
                ) : (
                  <form
                    action={
                      item.kind === "HOMEWORK"
                        ? toggleHomeworkStatus.bind(null, item.rawId)
                        : cycleTaskStatus.bind(null, item.rawId)
                    }
                  >
                    <button
                      type="submit"
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full border text-[10px]",
                        item.done ? "border-success bg-success text-white" : "border-border"
                      )}
                    >
                      {item.done ? "✓" : ""}
                    </button>
                  </form>
                )}
                <span className={item.done ? "text-muted line-through" : ""}>
                  {item.title}
                  {item.subjectName ? ` · ${item.subjectName}` : ""}
                </span>
              </div>
              <Badge variant={item.done ? "success" : "default"}>{item.kind}</Badge>
            </div>
            {!item.done && item.suggestion && <p className="mt-1 pl-7 text-xs text-accent">{item.suggestion}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
