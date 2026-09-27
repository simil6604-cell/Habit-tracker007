import Link from "next/link";
import { ArrowRight, Flame, GraduationCap, Layers, ListChecks, NotebookPen, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressRing } from "./progress-ring";
import { donePct, heroCopy, type SchoolHeroData } from "@/lib/school/hero";

/** The links that were four buttons on a coloured banner, as somewhere to go next. */
const SHORTCUTS = [
  { href: "/school/ai", label: "School AI", icon: GraduationCap },
  { href: "/school/habits", label: "Habit tracker", icon: ListChecks },
  { href: "/school/planner", label: "Study planner", icon: NotebookPen },
  { href: "/school/flashcards", label: "Flashcards", icon: Layers },
  { href: "/school/timetable", label: "Timetable", icon: Play },
];

export function SchoolHero({ data }: { data: SchoolHeroData }) {
  const copy = heroCopy(data);
  const left = Math.max(0, data.totalToday - data.doneToday);
  const pct = donePct(data.doneToday, data.totalToday);
  // Nothing due reads as a full ring with a tick, not a zero — there is
  // genuinely nothing left, which is a different thing from having failed.
  const ringValue = data.totalToday === 0 ? "—" : String(left);
  const ringLabel = data.totalToday === 0 ? "nothing due" : left === 0 ? "all done" : left === 1 ? "thing left" : "things left";

  return (
    <section className="rounded-3xl border border-border bg-surface p-5 sm:p-7" data-testid="school-hero">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <ProgressRing pct={pct} value={ringValue} label={ringLabel} />

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">{copy.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {copy.headline}
            <br />
            <span className="text-cat-school">{copy.accentLine}</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted">{copy.subtitle}</p>

          {data.startHere && (
            <Link
              href={data.startHere.href}
              data-testid="school-start-here"
              className="mt-5 flex items-center gap-3 rounded-2xl border border-border bg-surface-muted px-4 py-3 transition hover:border-cat-school/50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-cat-school">Start here</p>
                <p className="truncate text-sm font-medium">{data.startHere.title}</p>
                {data.startHere.detail && <p className="truncate text-xs text-muted">{data.startHere.detail}</p>}
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cat-school text-white">
                <ArrowRight size={16} />
              </span>
            </Link>
          )}

          <Link href={copy.cta.href} className="mt-4 inline-block">
            <span className="inline-flex items-center gap-2 rounded-full bg-cat-school px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90">
              <Play size={15} /> {copy.cta.label}
            </span>
          </Link>
        </div>
      </div>

      <div className="mt-7 border-t border-border pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">Week activity</p>
        <div className="mt-3 flex items-end gap-1.5" data-testid="school-week">
          {data.week.map((day) => (
            <div key={day.dateKey} className="flex flex-1 flex-col items-center gap-1.5">
              <span
                title={day.pct === null ? "No habits tracked" : `${day.pct}% of habits done`}
                className={cn(
                  "h-1.5 w-full rounded-full",
                  day.pct === null ? "bg-surface-muted" : "bg-cat-school"
                )}
                // A part-done day reads as a part-filled mark rather than a
                // different colour — one hue, more is more.
                style={day.pct !== null ? { opacity: 0.25 + (day.pct / 100) * 0.75 } : undefined}
              />
              <span className={cn("text-[10px]", day.isToday ? "font-semibold text-foreground" : "text-muted")}>
                {day.weekday}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Flame size={12} className={data.streak > 0 ? "text-cat-school" : ""} />
            <strong className="text-foreground">{data.streak}</strong> day streak
          </span>
          <span>
            <strong className="text-foreground">{data.subjectCount}</strong> subject
            {data.subjectCount === 1 ? "" : "s"} · <strong className="text-foreground">{data.topicCount}</strong> topic
            {data.topicCount === 1 ? "" : "s"}
          </span>
          {data.flashcardsDue > 0 && (
            <span>
              <strong className="text-foreground">{data.flashcardsDue}</strong> flashcard
              {data.flashcardsDue === 1 ? "" : "s"} due
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">Start something new</p>
        <div className="mt-3 flex flex-wrap gap-2" data-testid="school-shortcuts">
          {SHORTCUTS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm transition hover:border-cat-school/50 hover:text-cat-school"
            >
              <Icon size={14} /> {label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
