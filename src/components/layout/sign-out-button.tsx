"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        aria-label="Sign out"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted transition hover:bg-surface-muted hover:text-foreground"
      >
        <LogOut size={16} />
      </button>
    </form>
  );
}
