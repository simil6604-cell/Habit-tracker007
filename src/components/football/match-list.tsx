"use client";

import { useState } from "react";
import { format } from "date-fns";
import { recordMatchResult, deleteMatch } from "@/lib/football/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type Match = { id: string; opponent: string; date: Date; isHome: boolean; scoreFor: number | null; scoreAgainst: number | null };

export function MatchList({ matches }: { matches: Match[] }) {
  const [editing, setEditing] = useState<string | null>(null);

  if (matches.length === 0) {
    return <p className="text-sm text-muted">No matches scheduled.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {matches.map((m) => (
        <li key={m.id} className="py-2.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <div>
              <p className="font-medium">{m.isHome ? "vs" : "@"} {m.opponent}</p>
              <p className="text-xs text-muted">{format(m.date, "EEE, MMM d · HH:mm")}</p>
            </div>
            <div className="flex items-center gap-2">
              {m.scoreFor !== null ? (
                <Badge variant={m.scoreFor > (m.scoreAgainst ?? 0) ? "success" : m.scoreFor < (m.scoreAgainst ?? 0) ? "danger" : "default"}>
                  {m.scoreFor} – {m.scoreAgainst}
                </Badge>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setEditing(editing === m.id ? null : m.id)}>Add result</Button>
              )}
              <form action={deleteMatch.bind(null, m.id)}>
                <button type="submit" className="text-muted hover:text-danger"><Trash2 size={14} /></button>
              </form>
            </div>
          </div>
          {editing === m.id && (
            <form
              action={async (fd) => {
                await recordMatchResult(m.id, fd);
                setEditing(null);
              }}
              className="mt-2 flex items-center gap-2"
            >
              <input name="scoreFor" type="number" placeholder="For" className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
              <span className="text-muted">–</span>
              <input name="scoreAgainst" type="number" placeholder="Against" className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
              <Button type="submit" size="sm" variant="secondary">Save</Button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
