"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { importStandingsFromLink } from "@/lib/football/actions";
import { Button } from "@/components/ui/button";

export function StandingsSyncPanel({
  initialUrl,
  lastSyncedAt,
}: {
  initialUrl: string | null;
  lastSyncedAt: Date | null;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncedAt, setSyncedAt] = useState(lastSyncedAt);
  const [isPending, startTransition] = useTransition();

  function sync() {
    if (!url.trim()) {
      setStatus({ ok: false, message: "Paste a link first." });
      return;
    }
    setStatus(null);
    startTransition(async () => {
      const result = await importStandingsFromLink(url);
      if (result.ok) {
        setStatus({ ok: true, message: `Imported ${result.count} teams.` });
        setSyncedAt(new Date());
      } else {
        setStatus({ ok: false, message: result.error });
      }
    });
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
      <p className="text-xs text-muted">
        Fetches that page and asks the connected AI to read off the real standings — nothing is invented. If a page
        can&apos;t be read (needs a login, or renders with JavaScript), enter the table manually below instead.
      </p>
    </div>
  );
}
