import type { MemoryBuckets } from "@/lib/school/insights";

/**
 * How much of the deck is held, as one bar.
 *
 * A meter rather than a chart: this is a single whole split four ways, and a
 * pie or a column chart would be four marks where one does. The four buckets
 * are ORDERED, so the colour is a sequential ramp in one hue — light to dark
 * as a card gets stronger — and the order is readable before any label is.
 *
 * Every bucket carries its own count beside the bar. That is not decoration:
 * the pale end of a sequential ramp on white is under 3:1 by construction, and
 * a direct label is the relief that makes the segment legible anyway. It also
 * means the tooltip is a convenience rather than the only way to read a value.
 *
 * A 2px surface-coloured gap separates the segments, so two adjacent steps of
 * the same hue never melt into one another.
 */

const STEPS = [
  { key: "neverOpened", label: "Never opened", color: "var(--mem-0)" },
  { key: "justStarted", label: "Just started", color: "var(--mem-1)" },
  { key: "gettingThere", label: "Getting there", color: "var(--mem-2)" },
  { key: "strong", label: "Strong", color: "var(--mem-3)" },
] as const;

export function MemoryStrengthMeter({ buckets }: { buckets: MemoryBuckets }) {
  const { total } = buckets;

  if (total === 0) {
    return <p className="text-sm text-muted">No flashcards yet, so there is no memory to measure.</p>;
  }

  const segments = STEPS.map((step) => ({
    ...step,
    count: buckets[step.key],
    pct: (buckets[step.key] / total) * 100,
  })).filter((segment) => segment.count > 0);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full ring-1 ring-border"
        role="img"
        aria-label={STEPS.map((s) => `${buckets[s.key]} ${s.label.toLowerCase()}`).join(", ")}
      >
        {segments.map((segment) => (
          <div
            key={segment.key}
            style={{ width: `${segment.pct}%`, background: segment.color }}
            className="h-full first:rounded-l-full last:rounded-r-full"
            title={`${segment.label}: ${segment.count} of ${total}`}
          />
        ))}
      </div>

      {/* The table view the contrast warning obliges, and the legend, in one. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2" data-testid="memory-legend">
        {STEPS.map((step) => (
          <div key={step.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-border"
              style={{ background: step.color }}
            />
            <dt className="sr-only">{step.label}</dt>
            <dd className="flex min-w-0 flex-col leading-tight">
              <span className="text-base font-semibold tabular-nums">{buckets[step.key]}</span>
              <span className="truncate text-xs text-muted">{step.label}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
