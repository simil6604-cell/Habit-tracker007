"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Outcome =
  | { kind: "done"; rows: number; photos: number; ignored: string[] }
  | { kind: "error"; message: string };

/**
 * Restoring is the half of a backup that decides whether the other half was
 * worth making — so it says what it is about to do before it does it, and what
 * it actually did afterwards, in rows and photos rather than a checkmark.
 */
export function RestoreBackupPanel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setOutcome({ kind: "error", message: "Pick your backup file first." });
      return;
    }

    setBusy(true);
    setOutcome(null);
    try {
      const body = new FormData();
      body.set("backup", file);
      const res = await fetch("/api/restore", { method: "POST", body });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload || typeof payload.rows !== "number") {
        setOutcome({ kind: "error", message: payload?.error ?? "The restore didn't go through." });
      } else {
        setOutcome({ kind: "done", rows: payload.rows, photos: payload.photos, ignored: payload.ignored ?? [] });
        setConfirmed(false);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    } catch {
      setOutcome({ kind: "error", message: "The upload couldn't be sent — check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileRef}
        type="file"
        accept=".gz,.tgz,application/gzip,application/x-gzip"
        className="text-xs text-muted file:mr-2 file:rounded-lg file:border-0 file:bg-surface-muted file:px-2 file:py-1.5 file:text-xs"
      />
      <label className="flex items-start gap-2 text-xs text-muted">
        <input
          type="checkbox"
          data-testid="restore-confirm"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5"
        />
        <span>
          I understand this <strong>replaces</strong> everything in this account with what is in the file.
        </span>
      </label>
      <div>
        <Button type="button" size="sm" variant="secondary" disabled={!confirmed || busy} onClick={submit}>
          {busy ? "Restoring…" : "Restore this backup"}
        </Button>
      </div>

      {outcome?.kind === "done" && (
        <p className="text-xs text-success" data-testid="restore-result">
          Restored {outcome.rows} {outcome.rows === 1 ? "entry" : "entries"} and {outcome.photos}{" "}
          {outcome.photos === 1 ? "photo" : "photos"}.
          {outcome.ignored.length > 0 && ` ${outcome.ignored.length} item(s) in the file were not part of a backup and were left out.`}
        </p>
      )}
      {outcome?.kind === "error" && (
        <p className="text-xs text-danger" data-testid="restore-error">
          {outcome.message}
        </p>
      )}
    </div>
  );
}
