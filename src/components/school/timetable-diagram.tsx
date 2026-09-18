import { slotsToGridRows, GRID_DAYS } from "@/lib/school/timetable-grid";
import { cn } from "@/lib/utils";

type Slot = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  periodName: string | null;
  periodType: string;
  label: string | null;
  highlight: boolean;
  subject: { name: string; isExamSubject: boolean } | null;
};

const TYPE_BG: Record<string, string> = {
  REGISTRATION: "bg-surface-muted",
  BREAK: "bg-surface-muted",
  LUNCH: "bg-surface-muted",
};

export function TimetableDiagram({ slots }: { slots: Slot[] }) {
  const rows = slotsToGridRows(
    slots.map((s) => ({
      ...s,
      highlight: s.highlight || Boolean(s.subject?.isExamSubject),
    }))
  );

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">No timetable yet — use the editor below to add your real school week.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-[#12213e] text-white">
            <th className="w-40 border-b border-border p-3 text-left text-xs font-semibold">&nbsp;</th>
            {GRID_DAYS.map((d) => (
              <th key={d} className="border-b border-border p-3 text-left text-sm font-semibold">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.startTime}-${row.endTime}-${row.periodName}`} className="border-b border-border last:border-0">
              <td className="border-r border-border bg-[#12213e] p-3 align-top text-white">
                <p className="text-sm font-semibold">{row.periodName || "—"}</p>
                <p className="text-xs text-white/70">
                  {row.startTime}–{row.endTime}
                </p>
              </td>
              {GRID_DAYS.map((_, dayIdx) => {
                const cell = row.cells.find((c) => c.day === dayIdx);
                return (
                  <td
                    key={dayIdx}
                    className={cn(
                      "p-3 align-top text-sm",
                      TYPE_BG[row.periodType],
                      cell?.highlight && "bg-[#4a4a1f] text-[#f0e6a8] font-medium"
                    )}
                  >
                    {cell?.value || <span className="text-muted">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
