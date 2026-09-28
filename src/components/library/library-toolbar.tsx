"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutGrid, List, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIBRARY_SORTS, LIBRARY_TABS, type LibraryCounts, type LibrarySort, type LibraryType, type LibraryView } from "@/lib/library/library";

/**
 * Search, tabs, sort and the grid/list switch.
 *
 * Everything lives in the query string rather than in component state, so a
 * filtered view can be linked, bookmarked and reloaded — and the back button
 * does what it looks like it should. The page itself stays a server component
 * and does the filtering where the data is.
 */
export function LibraryToolbar({
  counts,
  type,
  sort,
  view,
  query,
}: {
  counts: LibraryCounts;
  type: "ALL" | LibraryType;
  sort: LibrarySort;
  view: LibraryView;
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
    return qs ? `/library?${qs}` : "/library";
  }

  // Typing is debounced: a navigation per keystroke would re-run four queries
  // for every letter, and the results would flicker behind the typing.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => router.replace(withParam("q", text.trim()), { scroll: false }), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="flex flex-col gap-4">
      <label className="relative flex items-center">
        <Search size={18} className="pointer-events-none absolute left-4 text-muted" aria-hidden />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search your library…"
          aria-label="Search your library"
          data-testid="library-search"
          className="w-full rounded-2xl border border-border bg-surface py-3.5 pl-12 pr-4 text-sm outline-none focus:ring-2 focus:ring-accent"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1" data-testid="library-tabs">
          {LIBRARY_TABS.map((tab) => {
            const active = tab.value === type;
            return (
              <a
                key={tab.value}
                href={withParam("type", tab.value === "ALL" ? "" : tab.value)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
                  active ? "bg-surface-muted text-foreground" : "text-muted hover:text-foreground"
                )}
              >
                {tab.label}
                {/* The count is the point of the tab: it says whether there is
                    anything behind it before you spend a click finding out. */}
                <span className="text-xs tabular-nums text-muted">{counts[tab.value]}</span>
              </a>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <select
            aria-label="Sort"
            data-testid="library-sort"
            value={sort}
            onChange={(e) => router.replace(withParam("sort", e.target.value), { scroll: false })}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          >
            {LIBRARY_SORTS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <div className="flex items-center rounded-xl border border-border bg-surface p-0.5">
            {([["GRID", LayoutGrid, "Grid view"], ["LIST", List, "List view"]] as const).map(([value, Icon, label]) => (
              <a
                key={value}
                href={withParam("view", value === "GRID" ? "" : value)}
                aria-label={label}
                aria-current={view === value ? "true" : undefined}
                className={cn(
                  "rounded-lg p-2 transition",
                  view === value ? "bg-surface-muted text-foreground" : "text-muted hover:text-foreground"
                )}
              >
                <Icon size={16} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
