"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveTimetableGrid } from "@/lib/school/actions";
import { PERIOD_TYPES, GRID_DAYS, FIXED_PERIOD_TYPES, type GridPeriodRow, type PeriodType } from "@/lib/school/timetable-grid";

type Subject = { id: string; name: string };

function emptyRow(): GridPeriodRow {
  return { periodName: "", startTime: "09:00", endTime: "10:00", periodType: "LESSON", cells: [] };
}

const SUBJECT_DATALIST_ID = "timetable-subject-options";

export function TimetableEditor({ initialRows, subjects }: { initialRows: GridPeriodRow[]; subjects: Subject[] }) {
  const [rows, setRows] = useState<GridPeriodRow[]>(initialRows.length ? initialRows : [emptyRow()]);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  function updateRow(index: number, patch: Partial<GridPeriodRow>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  function updateCell(rowIndex: number, day: number, patch: { value?: string; highlight?: boolean }) {
    setRows((rs) =>
      rs.map((r, i) => {
        if (i !== rowIndex) return r;
        const existing = r.cells.find((c) => c.day === day);
        const nextCells = existing
          ? r.cells.map((c) => (c.day === day ? { ...c, ...patch } : c))
          : [...r.cells, { day, value: "", highlight: false, ...patch }];
        return { ...r, cells: nextCells };
      })
    );
    setSaved(false);
  }

  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows((rs) => rs.filter((_, i) => i !== index));
    setSaved(false);
  }

  function save() {
    startTransition(async () => {
      await saveTimetableGrid(rows.filter((r) => r.startTime && r.endTime));
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <datalist id={SUBJECT_DATALIST_ID}>
        {subjects.map((s) => (
          <option key={s.id} value={s.name} />
        ))}
        <option value="Study" />
        <option value="Free" />
      </datalist>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface-muted text-xs text-muted">
              <th className="p-2 text-left">Period</th>
              <th className="p-2 text-left">Start</th>
              <th className="p-2 text-left">End</th>
              <th className="p-2 text-left">Default type</th>
              {GRID_DAYS.map((d) => (
                <th key={d} className="p-2 text-left">{d.slice(0, 3)}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const fixed = FIXED_PERIOD_TYPES.includes(row.periodType);
              return (
                <tr key={rowIndex} className="border-t border-border align-top">
                  <td className="p-1.5">
                    <input
                      value={row.periodName}
                      onChange={(e) => updateRow(rowIndex, { periodName: e.target.value })}
                      placeholder="P1"
                      className="w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="time"
                      value={row.startTime}
                      onChange={(e) => updateRow(rowIndex, { startTime: e.target.value })}
                      className="w-28 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="time"
                      value={row.endTime}
                      onChange={(e) => updateRow(rowIndex, { endTime: e.target.value })}
                      className="w-28 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
                    />
                  </td>
                  <td className="p-1.5">
                    <select
                      value={row.periodType}
                      onChange={(e) => updateRow(rowIndex, { periodType: e.target.value as PeriodType })}
                      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
                    >
                      {PERIOD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                  {GRID_DAYS.map((_, day) => {
                    const cell = row.cells.find((c) => c.day === day);
                    return (
                      <td key={day} className="p-1.5">
                        <div className="flex items-center gap-1">
                          <input
                            value={cell?.value ?? ""}
                            onChange={(e) => updateCell(rowIndex, day, { value: e.target.value })}
                            placeholder={fixed ? row.periodType : "—"}
                            list={fixed ? undefined : SUBJECT_DATALIST_ID}
                            className="w-40 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
                          />
                          {!fixed && (
                            <input
                              type="checkbox"
                              title="Highlight (e.g. exam-board club)"
                              checked={cell?.highlight ?? false}
                              onChange={(e) => updateCell(rowIndex, day, { highlight: e.target.checked })}
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="p-1.5">
                    <button onClick={() => removeRow(rowIndex)} className="text-muted hover:text-danger">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus size={14} /> Add period
        </Button>
        <Button size="sm" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save timetable"}
        </Button>
        {saved && <span className="text-xs text-success">Saved</span>}
      </div>
      <p className="text-xs text-muted">
        Type a subject name (autocompletes from your subjects) to link a real lesson, or type &quot;Study&quot; /
        &quot;Free&quot; / a club name — same period slot can be different things on different days, just like a real
        timetable. Subjects marked as an exam subject highlight automatically.
      </p>
    </div>
  );
}
