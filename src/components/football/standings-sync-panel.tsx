"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { importStandingsFromLink, importStandingsFromPaste } from "@/lib/football/actions";
import { Button } from "@/components/ui/button";

export function StandingsSyncPanel({
  initialUrl,
  lastSyncedAt,
}: {
  initialUrl: string | null;
  lastSyncedAt: Date | null;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [pasted, setPasted] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncedAt, setSyncedAt] = useState(lastSyncedAt);
  const [isPending, startTransition] = useTransition();

  /**
   * Both routes end in the same rows, so they share the reporting.
   *
   * The link route asks this server to fetch the page, which fails on a site
   * that builds its table in the browser or refuses a server outright. The
   * paste route has neither problem: the browser in front of the page can
   * already see the table.
   */
  function run(load: () => Promise<{ ok: true; count: number } | { ok: false; error: string }>, done?: () => void) {
    setStatus(null);
    startTransition(async () => {
      try {
        const result = await load();
        if (result.ok) {
          setStatus({ ok: true, message: `Imported ${result.count} teams.` });
          setSyncedAt(new Date());
          done?.();
        } else {
          setStatus({ ok: false, message: result.error });
        }
      } catch {
        setStatus({
          ok: false,
          message:
            "That didn't get through — the page may be too slow to read, or the connection dropped. Try again, or paste the table below instead.",
        });
      }
    });
  }

  function sync() {
    if (!url.trim()) {
      setStatus({ ok: false, message: "Paste a link first." });
      return;
    }
    run(() => importStandingsFromLink(url));
  }

  function readPasted() {
    run(
      () => importStandingsFromPaste(pasted),
      () => {
        setPasted("");
        setShowPaste(false);
      }
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-muted p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Sync from your league&apos;s table page</p>
      <div className="flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste your league table URL (e.g. matchcenter.el-pl.ch, football.ch, fvrz.ch…)"
          className="min-w-[16rem] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <Button type="button" size="sm" variant="secondary" onClick={sync} disabled={isPending}>
          {isPending ? "Fetching…" : syncedAt ? "Refresh" : "Fetch table"}
        </Button>
      </div>
      {status && (
        <p className={`text-xs ${status.ok ? "text-success" : "text-danger"}`}>{status.message}</p>
      )}
      {syncedAt && !status && (
        <p className="text-xs text-muted">Last synced {formatDistanceToNow(syncedAt, { addSuffix: true })}.</p>
      )}
      {showPaste ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">
            Open the league page in your browser, select the table, copy it, and paste it here. This works even when
            the page can&apos;t be read from here — your browser can already see it.
          </p>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={5}
            placeholder={"1  FC Beispiel  10  7  2  1  24:9  23\n2  SC Muster     10  6  3  1  19:11 21"}
            aria-label="Paste the league table"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={readPasted} disabled={isPending}>
              {isPending ? "Reading…" : "Read pasted table"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowPaste(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowPaste(true)}
          className="self-start text-xs text-accent underline-offset-2 hover:underline"
        >
          Page can&apos;t be read? Paste the table instead →
        </button>
      )}

      <p className="text-xs text-muted">
        Either way the connected AI reads off the real standings — nothing is invented. Or enter the rows by hand
        below.
      </p>
    </div>
  );
}
