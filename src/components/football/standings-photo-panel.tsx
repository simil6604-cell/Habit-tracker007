"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Check, X } from "lucide-react";
import { readStandingsPhoto, saveCheckedStandings } from "@/lib/football/actions";
import type { ImportedStanding } from "@/lib/football/standings-import";
import { Button } from "@/components/ui/button";

/**
 * Photograph the table, let the AI in this app read it, check it, keep it.
 *
 * The route that needs nothing from the league's website: no fetch it can
 * refuse, no page that only renders in a browser, no selecting a table with a
 * fingertip. The table is on a screen or on paper in front of you — take a
 * picture of it.
 *
 * What comes back is shown before it is saved, and every cell is editable. A
 * model reading a column of numbers off a photo is right most of the time and
 * not all of the time, and a points column one out changes what the app says
 * about the race for first without ever looking wrong. The person who took the
 * picture is the one who can see it is wrong, so they get the last word.
 */
const COLUMNS = [
  { key: "rank", label: "#", width: "w-10" },
  { key: "played", label: "P", width: "w-10" },
  { key: "won", label: "W", width: "w-10" },
  { key: "drawn", label: "D", width: "w-10" },
  { key: "lost", label: "L", width: "w-10" },
  { key: "goalsFor", label: "GF", width: "w-12" },
  { key: "goalsAgainst", label: "GA", width: "w-12" },
  { key: "points", label: "Pts", width: "w-12" },
] as const;

type NumericKey = (typeof COLUMNS)[number]["key"];

export function StandingsPhotoPanel() {
  const [rows, setRows] = useState<ImportedStanding[] | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function read(formData: FormData) {
    setStatus(null);
    setRows(null);
    startTransition(async () => {
      try {
        const result = await readStandingsPhoto(formData);
        if (result.ok) {
          setRows(result.data);
          setStatus({ ok: true, message: `Read ${result.data.length} teams. Check them, then keep the table.` });
        } else {
          setStatus({ ok: false, message: result.error });
        }
      } catch {
        setStatus({ ok: false, message: "That didn't get through — check your connection and try the photo again." });
      }
    });
  }

  function keep() {
    if (!rows) return;
    startTransition(async () => {
      try {
        const result = await saveCheckedStandings(rows);
        if (result.ok) {
          setRows(null);
          if (fileRef.current) fileRef.current.value = "";
          setStatus({ ok: true, message: `Saved ${result.count} teams. The table below is yours now.` });
        } else {
          setStatus({ ok: false, message: result.error });
        }
      } catch {
        setStatus({ ok: false, message: "Saving didn't get through — try again." });
      }
    });
  }

  function edit(index: number, key: NumericKey | "teamName", value: string) {
    setRows((current) => {
      if (!current) return current;
      const next = [...current];
      next[index] =
        key === "teamName"
          ? { ...next[index], teamName: value }
          : { ...next[index], [key]: value === "" ? 0 : Number(value) || 0 };
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted p-3" data-testid="standings-photo">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Photograph the table</p>
      <p className="text-xs text-muted">
        A picture of the table — off the screen or off a piece of paper. The AI in this app reads it and shows you what
        it got; nothing is saved until you say so.
      </p>

      <form action={read} className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          name="photo"
          accept="image/*"
          required
          className="min-w-0 flex-1 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-2 file:text-xs file:text-foreground"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
          <Camera size={14} /> {isPending ? "Reading…" : "Read the photo"}
        </Button>
      </form>

      {status && (
        <p role="status" className={`text-xs ${status.ok ? "text-success" : "text-danger"}`}>
          {status.message}
        </p>
      )}

      {rows && (
        <div className="flex flex-col gap-2" data-testid="standings-preview">
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 pr-2 font-medium">Team</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="py-1 pr-1 font-medium">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td className="py-0.5 pr-2">
                      <input
                        value={row.teamName}
                        aria-label={`Team in row ${i + 1}`}
                        onChange={(e) => edit(i, "teamName", e.target.value)}
                        className="w-full min-w-[9rem] rounded border border-border bg-surface px-2 py-1"
                      />
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="py-0.5 pr-1">
                        <input
                          value={row[c.key]}
                          inputMode="numeric"
                          aria-label={`${c.label} for ${row.teamName || `row ${i + 1}`}`}
                          onChange={(e) => edit(i, c.key, e.target.value)}
                          className={`${c.width} rounded border border-border bg-surface px-1 py-1 text-center`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={keep} disabled={isPending} data-testid="keep-standings">
              <Check size={14} /> {isPending ? "Saving…" : "This is right — keep it"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setRows(null); setStatus(null); }} disabled={isPending}>
              <X size={14} /> Throw it away
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
