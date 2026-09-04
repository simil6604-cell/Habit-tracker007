import { addTimetableSlot } from "@/lib/school/actions";
import { DAYS } from "./timetable-grid";
import { Button } from "@/components/ui/button";

export function AddSlotForm({ subjects }: { subjects: { id: string; name: string }[] }) {
  return (
    <form action={addTimetableSlot} className="grid grid-cols-2 gap-2 sm:grid-cols-6">
      <select name="dayOfWeek" required className="col-span-1 rounded-lg border border-border bg-surface px-2 py-2 text-sm">
        {DAYS.map((d, i) => (
          <option key={d} value={i}>
            {d.slice(0, 3)}
          </option>
        ))}
      </select>
      <input name="startTime" type="time" required defaultValue="08:00" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
      <input name="endTime" type="time" required defaultValue="09:00" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
      <select name="subjectId" className="col-span-2 rounded-lg border border-border bg-surface px-2 py-2 text-sm">
        <option value="">Free / other…</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input name="label" placeholder="Label (e.g. Break)" className="col-span-1 rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
      <input name="room" placeholder="Room" className="col-span-1 rounded-lg border border-border bg-surface px-2 py-2 text-sm sm:col-span-1" />
      <Button type="submit" size="sm" variant="secondary" className="col-span-2 sm:col-span-1">
        Add lesson
      </Button>
    </form>
  );
}
