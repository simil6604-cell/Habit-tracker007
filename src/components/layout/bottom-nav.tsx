"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MOBILE_NAV_ITEMS } from "./nav-items";
import { NavIcon } from "./nav-icon";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden">
      {MOBILE_NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition",
              active ? "text-accent" : "text-muted"
            )}
          >
            <NavIcon item={item} size={20} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
