import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_META } from "./category-style";

type View = "day" | "week" | "month";

export function CalendarNav({
  view,
  date,
  prevHref,
  nextHref,
  label,
}: {
  view: View;
  date: string;
  prevHref: string;
  nextHref: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={prevHref} className="rounded-lg border border-border p-1.5 hover:bg-surface-muted"><ChevronLeft size={16} /></Link>
          <p className="min-w-[160px] text-center font-medium">{label}</p>
          <Link href={nextHref} className="rounded-lg border border-border p-1.5 hover:bg-surface-muted"><ChevronRight size={16} /></Link>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {(["day", "week", "month"] as View[]).map((v) => (
            <Link
              key={v}
              href={`/calendar?view=${v}&date=${date}`}
              className={cn("rounded-md px-3 py-1 text-sm capitalize", view === v ? "bg-accent text-accent-foreground" : "text-muted")}
            >
              {v}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {Object.entries(CATEGORY_META).map(([key, meta]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} /> {meta.label}
          </span>
        ))}
      </div>
    </div>
  );
}
