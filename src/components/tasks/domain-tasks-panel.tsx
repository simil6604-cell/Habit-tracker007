import Link from "next/link";
import { createTask } from "@/lib/tasks/actions";
import { TaskItem } from "@/components/tasks/task-item";
import { Button } from "@/components/ui/button";

type Task = {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  dueDate: Date | null;
  estimatedMin: number | null;
};

/**
 * The same task list the /tasks page shows, narrowed to one domain so it can
 * sit on that domain's own page — tasks belong where the work happens, not
 * only behind a separate tab.
 */
export function DomainTasksPanel({ category, tasks }: { category: "SCHOOL" | "GYM" | "FOOTBALL"; tasks: Task[] }) {
  const open = tasks.filter((t) => t.status !== "DONE");

  return (
    <div className="flex flex-col gap-3">
      <form action={createTask} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="category" value={category} />
        <input
          name="title"
          placeholder="Add a task…"
          required
          className="min-w-48 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <input name="dueDate" type="date" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <Button type="submit" size="sm" variant="secondary">
          Add
        </Button>
      </form>

      {open.length === 0 ? (
        <p className="text-sm text-muted">Nothing open here — add a task above.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {open.slice(0, 8).map((t) => (
            <TaskItem key={t.id} task={t} />
          ))}
        </ul>
      )}

      <Link href="/tasks" className="text-xs font-medium text-accent hover:underline">
        See all tasks →
      </Link>
    </div>
  );
}
