import Link from "next/link";
import { format, isSameDay } from "date-fns";
import type { CalendarItem } from "@/lib/calendar/items";
import { CATEGORY_META } from "./category-style";
import { cn } from "@/lib/utils";

export function WeekView({ days, items }: { days: Date[]; items: CalendarItem[] }) {
  const today = new Date();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => {
        const dayItems = items.filter((i) => isSameDay(i.date, day));
        return (
          <div key={day.toISOString()} className="min-w-0 rounded-xl border border-border bg-surface-muted p-2.5">
            <Link href={`/calendar?view=day&date=${format(day, "yyyy-MM-dd")}`}>
              <p className={cn("mb-2 text-xs font-semibold", isSameDay(day, today) ? "text-accent" : "text-muted")}>
                {format(day, "EEE d")}
              </p>
            </Link>
            <div className="flex flex-col gap-1.5">
              {dayItems.length === 0 && <p className="text-xs text-muted/60">—</p>}
              {dayItems.slice(0, 6).map((item) => {
                const meta = CATEGORY_META[item.category];
                return (
                  <div key={item.id} className="rounded-lg border-l-4 bg-surface p-1.5 text-xs" style={{ borderLeftColor: meta.color }}>
                    <p className="truncate font-medium">{item.title}</p>
                    {item.time && <p className="text-muted">{item.time}</p>}
                  </div>
                );
              })}
              {dayItems.length > 6 && <p className="text-xs text-muted">+{dayItems.length - 6} more</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
