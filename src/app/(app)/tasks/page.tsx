import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { createTask } from "@/lib/tasks/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TaskItem } from "@/components/tasks/task-item";

export default async function TasksPage() {
  const session = await auth();
  const userId = session!.user.id;

  const tasks = await prisma.task.findMany({
    where: { userId },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  const open = tasks.filter((t) => t.status !== "DONE");
  const done = tasks.filter((t) => t.status === "DONE");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
      <p className="mt-1 text-muted">Everything you need to do, across every part of your life.</p>

      <Card className="mt-6">
        <CardHeader><CardTitle>Add a task</CardTitle></CardHeader>
        <CardContent>
          <form action={createTask} className="flex flex-wrap gap-2">
            <input name="title" required placeholder="Task title" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <select name="category" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
              <option value="GENERAL">General</option>
              <option value="SCHOOL">School</option>
              <option value="GYM">Gym</option>
              <option value="FOOTBALL">Football</option>
            </select>
            <select name="priority" defaultValue="MEDIUM" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
            <input name="dueDate" type="date" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
            <input name="estimatedMin" type="number" placeholder="Minutes" className="w-24 rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
            <Button type="submit" size="sm" variant="secondary">Add</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Open ({open.length})</CardTitle></CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y divide-border">
            {open.length === 0 && <p className="py-2 text-sm text-muted">Nothing open — nice work.</p>}
            {open.map((t) => <TaskItem key={t.id} task={t} />)}
          </ul>
        </CardContent>
      </Card>

      {done.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle>Completed ({done.length})</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border">
              {done.map((t) => <TaskItem key={t.id} task={t} />)}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
