import { format } from "date-fns";
import { createHomework, toggleHomeworkStatus, createExam, deleteExam } from "@/lib/school/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";

type SubjectOption = { id: string; name: string };

export function HomeworkPanel({
  homework,
  subjects,
}: {
  homework: { id: string; title: string; dueDate: Date; status: string; subject: { name: string } | null }[];
  subjects: SubjectOption[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <form action={createHomework} className="flex flex-wrap gap-2">
        <input name="title" required placeholder="Homework title" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <select name="subjectId" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
          <option value="">Subject…</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input name="dueDate" type="date" required className="rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
        <Button type="submit" size="sm" variant="secondary">Add</Button>
      </form>

      <ul className="flex flex-col divide-y divide-border">
        {homework.length === 0 && <p className="py-2 text-sm text-muted">No homework tracked yet.</p>}
        {homework.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
            <form action={toggleHomeworkStatus.bind(null, h.id)} className="flex items-center gap-2">
              <button type="submit" className={`h-4 w-4 rounded border ${h.status === "DONE" ? "border-success bg-success" : "border-border"}`} />
              <span className={h.status === "DONE" ? "text-muted line-through" : ""}>{h.title}</span>
              {h.subject && <span className="text-xs text-muted">· {h.subject.name}</span>}
            </form>
            <Badge variant={h.status === "DONE" ? "success" : "accent"}>{format(h.dueDate, "MMM d")}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExamPanel({
  exams,
  subjects,
}: {
  exams: { id: string; title: string; date: Date; weight: string; subject: { name: string } | null }[];
  subjects: SubjectOption[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <form action={createExam} className="flex flex-wrap gap-2">
        <input name="title" required placeholder="Exam title" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <select name="subjectId" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
          <option value="">Subject…</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input name="date" type="date" required className="rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
        <Button type="submit" size="sm" variant="secondary">Add</Button>
      </form>

      <ul className="flex flex-col divide-y divide-border">
        {exams.length === 0 && <p className="py-2 text-sm text-muted">No exams scheduled.</p>}
        {exams.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
            <div>
              <p className="font-medium">📝 {e.title}</p>
              {e.subject && <p className="text-xs text-muted">{e.subject.name}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="danger">{format(e.date, "MMM d, HH:mm")}</Badge>
              <form action={deleteExam.bind(null, e.id)}>
                <button type="submit" className="text-muted hover:text-danger">
                  <Trash2 size={14} />
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
