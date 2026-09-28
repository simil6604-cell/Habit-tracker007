"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MilestoneTab } from "@/lib/progress/milestones";

const TABS: { value: MilestoneTab; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REMAINING", label: "Remaining" },
];

/**
 * Search and the three tabs, in the query string.
 *
 * Prefixed parameter names (`mq`, `mtab`) so a domain page that already reads
 * `q` or `tab` for something else cannot collide with this one — the School
 * page in particular is a long page with several filtered things on it.
 */
export function MilestoneFilters({
  basePath,
  counts,
  tab,
  query,
}: {
  basePath: string;
  counts: Record<MilestoneTab, number>;
  tab: MilestoneTab;
  query: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [text, setText] = useState(query);
  const first = useRef(true);

  function withParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    return `${basePath}${qs ? `?${qs}` : ""}#progress`;
  }

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => router.replace(withParam("mq", text.trim()), { scroll: false }), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="flex flex-col gap-3">
      <label className="relative flex items-center">
        <Search size={16} className="pointer-events-none absolute left-3.5 text-muted" aria-hidden />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search by name, description or category…"
          aria-label="Search milestones"
          data-testid="milestone-search"
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-accent"
        />
      </label>

      <div className="flex flex-wrap items-center gap-1" data-testid="milestone-tabs">
        {TABS.map((option) => (
          <a
            key={option.value}
            href={withParam("mtab", option.value === "ALL" ? "" : option.value)}
            aria-current={option.value === tab ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
              option.value === tab ? "bg-surface-muted text-foreground" : "text-muted hover:text-foreground"
            )}
          >
            {option.label} ({counts[option.value]})
          </a>
        ))}
      </div>
    </div>
  );
}
