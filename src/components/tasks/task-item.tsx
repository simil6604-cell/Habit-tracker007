import { format } from "date-fns";
import { cycleTaskStatus, deleteTask } from "@/lib/tasks/actions";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_EMOJI: Record<string, string> = { SCHOOL: "🎓", GYM: "🏋️", FOOTBALL: "⚽", GENERAL: "✅" };

type Task = {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  dueDate: Date | null;
  estimatedMin: number | null;
};

export function TaskItem({ task }: { task: Task }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <form action={cycleTaskStatus.bind(null, task.id)} className="flex flex-1 items-center gap-3">
        <button
          type="submit"
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
            task.status === "DONE" && "border-success bg-success text-white",
            task.status === "IN_PROGRESS" && "border-accent text-accent",
            task.status === "TODO" && "border-border"
          )}
        >
          {task.status === "DONE" ? "✓" : task.status === "IN_PROGRESS" ? "…" : ""}
        </button>
        <span className={cn("text-sm", task.status === "DONE" && "text-muted line-through")}>
          {CATEGORY_EMOJI[task.category] ?? "✅"} {task.title}
        </span>
      </form>
      <div className="flex items-center gap-2">
        <Badge variant={task.priority === "HIGH" ? "danger" : task.priority === "LOW" ? "default" : "warning"}>{task.priority}</Badge>
        {task.dueDate && <span className="text-xs text-muted">{format(task.dueDate, "MMM d")}</span>}
        <form action={deleteTask.bind(null, task.id)}>
          <button type="submit" className="text-muted hover:text-danger"><Trash2 size={14} /></button>
        </form>
      </div>
    </li>
  );
}
