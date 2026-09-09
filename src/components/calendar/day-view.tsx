import type { CalendarItem } from "@/lib/calendar/items";
import { CATEGORY_META } from "./category-style";

export function DayView({ items }: { items: CalendarItem[] }) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">Nothing scheduled for this day.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((item) => {
        const meta = CATEGORY_META[item.category];
        return (
          <li key={item.id} className="flex items-center gap-3 border-l-4 py-2.5 pl-3" style={{ borderLeftColor: meta.color }}>
            <span className="w-14 shrink-0 text-xs tabular-nums text-muted">{item.time ?? "All day"}</span>
            <span>{meta.emoji}</span>
            <span className="text-sm font-medium">{item.title}</span>
          </li>
        );
      })}
    </ul>
  );
}
