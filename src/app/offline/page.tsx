import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline — Momentum" };

/**
 * Shown by the service worker when a page is asked for and there is no
 * connection.
 *
 * It says nothing about you on purpose. This is the one page kept on the
 * device, and a page kept on a device outlives signing out of it — so it holds
 * no marks, no weights, no photos, and not even a name.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl" aria-hidden>
        📡
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
      <p className="mt-2 text-muted">
        Momentum keeps your school, gym and football data on the server, so it needs a connection to show it. Nothing
        has been lost — this page is just the app saying the signal is gone.
      </p>
      <p className="mt-4 text-sm text-muted">
        Once you&apos;re back on wifi or mobile data, pull down to reload, or tap below.
      </p>
      {/*
        A plain link on purpose, and the lint rule is wrong for this one page.
        next/link navigates on the client, which fetches data this page has no
        connection for; "Try again" has to be a real page load, which is also
        what re-runs the check of whether the network is back.
      */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="mt-6 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
      >
        Try again
      </a>
    </div>
  );
}
