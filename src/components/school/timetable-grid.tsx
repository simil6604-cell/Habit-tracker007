import { deleteTimetableSlot } from "@/lib/school/actions";
import { X } from "lucide-react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Slot = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string | null;
  room: string | null;
  isFree: boolean;
  subject: { name: string; color: string } | null;
};

export function TimetableGrid({ slots }: { slots: Slot[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 overflow-x-auto sm:grid-cols-2 lg:grid-cols-7">
      {DAYS.map((day, idx) => {
        const daySlots = slots.filter((s) => s.dayOfWeek === idx).sort((a, b) => a.startTime.localeCompare(b.startTime));
        return (
          <div key={day} className="min-w-[140px] rounded-xl border border-border bg-surface-muted p-2.5">
            <p className="mb-2 text-xs font-semibold text-muted">{day}</p>
            <div className="flex flex-col gap-1.5">
              {daySlots.length === 0 && <p className="text-xs text-muted/70">—</p>}
              {daySlots.map((slot) => (
                <div
                  key={slot.id}
                  className="group relative rounded-lg border-l-4 bg-surface p-2 text-xs shadow-sm"
                  style={{ borderLeftColor: slot.isFree ? "var(--muted)" : slot.subject?.color ?? "var(--accent)" }}
                >
                  <p className="font-medium leading-tight">{slot.subject?.name ?? slot.label ?? "Free"}</p>
                  <p className="text-muted">{slot.startTime}–{slot.endTime}</p>
                  {slot.room && <p className="text-muted">Room {slot.room}</p>}
                  <form action={deleteTimetableSlot.bind(null, slot.id)} className="absolute right-1 top-1 opacity-0 group-hover:opacity-100">
                    <button type="submit" aria-label="Delete" className="text-muted hover:text-danger">
                      <X size={12} />
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { DAYS };
