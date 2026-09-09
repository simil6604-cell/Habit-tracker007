import type { AgendaItem } from "@/lib/planner/agenda";
import { Badge } from "@/components/ui/badge";

const CATEGORY_STYLE: Record<AgendaItem["category"], { emoji: string; variant: "accent" | "danger" | "success" | "warning" | "default" }> = {
  SCHOOL: { emoji: "🎓", variant: "accent" },
  STUDY: { emoji: "📚", variant: "accent" },
  GYM: { emoji: "🏋️", variant: "warning" },
  FOOTBALL: { emoji: "⚽", variant: "success" },
  EXAM: { emoji: "📝", variant: "danger" },
  TASK: { emoji: "✅", variant: "default" },
  RECOVERY: { emoji: "😴", variant: "default" },
};

export function AgendaList({ items, emptyLabel = "Nothing scheduled." }: { items: AgendaItem[]; emptyLabel?: string }) {
  if (items.length === 0) {
    return <p className="py-2 text-sm text-muted">{emptyLabel}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((item) => {
        const style = CATEGORY_STYLE[item.category];
        return (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="flex items-center gap-2.5">
              <span>{style.emoji}</span>
              <div>
                <p className="font-medium">{item.title}</p>
                {item.meta && <p className="text-xs text-muted">{item.meta}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {item.time && <span className="text-xs tabular-nums text-muted">{item.time}</span>}
              <Badge variant={style.variant}>{item.category}</Badge>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
