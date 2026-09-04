"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { NavIcon } from "./nav-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "./sign-out-button";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface p-4 lg:flex">
      <div className="flex items-center gap-2 px-2 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-lg text-accent-foreground">
          🔥
        </div>
        <span className="text-lg font-semibold tracking-tight">Optimize</span>
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:bg-surface-muted hover:text-foreground"
              )}
            >
              <NavIcon item={item} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <ThemeToggle />
        <SignOutButton />
      </div>
    </aside>
  );
}
