"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import type { FormState } from "@/lib/auth/actions";

export function AuthForm({
  mode,
  action,
  needsInviteCode = false,
  canRegister = true,
}: {
  mode: "login" | "register";
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  /** Show the invite-code field. Decided on the server; the field is required when it shows. */
  needsInviteCode?: boolean;
  /** False hides the "Register" link on the login screen, so it never points at a closed door. */
  canRegister?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div className="w-full max-w-sm animate-fade-in-up">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4">
          <Logo size={48} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "login"
            ? "Sign in to continue optimizing your day."
            : "Set up your all-in-one optimization coach."}
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        {mode === "register" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Name</label>
            <input
              name="name"
              required
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
              placeholder="Alex"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Email</label>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Password</label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
            placeholder="••••••••"
          />
        </div>
        {mode === "register" && needsInviteCode && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Invite code</label>
            <input
              name="invite"
              required
              // Not type="password": nobody has to hide this from the person at
              // their own screen, and a dotted-out field is the reason codes
              // get mistyped twice and given up on.
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
              placeholder="The code you were given"
            />
            <p className="mt-1 text-xs text-muted">
              This app runs on one person&apos;s AI credit, so accounts are by invitation.
            </p>
          </div>
        )}

        {state?.error && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>
        )}

        <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
          {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {mode === "login" ? (
          canRegister ? (
            <>
              No account yet?{" "}
              <Link href="/register" className="font-medium text-accent">
                Register
              </Link>
            </>
          ) : (
            <>Accounts on this app are created by invitation.</>
          )
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-accent">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
