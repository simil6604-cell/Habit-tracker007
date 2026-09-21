import Link from "next/link";
import { format, isSameDay, isSameMonth } from "date-fns";
import type { CalendarItem } from "@/lib/calendar/items";
import { CATEGORY_META } from "./category-style";
import { cn } from "@/lib/utils";

export function MonthView({ days, month, items }: { days: Date[]; month: Date; items: CalendarItem[] }) {
  const today = new Date();

  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
        <div key={d} className="pb-1 text-center text-xs font-medium text-muted">{d}</div>
      ))}
      {days.map((day) => {
        const dayItems = items.filter((i) => isSameDay(i.date, day));
        const categories = Array.from(new Set(dayItems.map((i) => i.category))).slice(0, 4);
        return (
          <Link
            key={day.toISOString()}
            href={`/calendar?view=day&date=${format(day, "yyyy-MM-dd")}`}
            className={cn(
              "flex min-h-[64px] flex-col gap-1 rounded-lg border border-border p-1.5 text-xs",
              !isSameMonth(day, month) && "opacity-40",
              isSameDay(day, today) && "border-accent"
            )}
          >
            <span className={cn("font-medium", isSameDay(day, today) && "text-accent")}>{format(day, "d")}</span>
            <div className="flex flex-wrap gap-0.5">
              {categories.map((c) => (
                <span key={c} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CATEGORY_META[c].color }} />
              ))}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
