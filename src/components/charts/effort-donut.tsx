"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export type EffortSlice = { name: string; minutes: number };

const COLORS: Record<string, string> = {
  School: "var(--cat-school)",
  Gym: "var(--cat-gym)",
  Football: "var(--cat-football)",
};

/**
 * Where the time has gone, as one ring.
 *
 * A donut is the right form here and one of the few places it is: three parts
 * of one whole, and the question is "how is it split", not "which is biggest"
 * — a reader can answer that from a bar chart faster, but cannot see the
 * whole at a glance.
 *
 * Every slice is directly labelled with its name, its hours and its share.
 * That is not decoration. The app's gym orange and football green sit at a
 * CVD separation of about 6 (deutan) — inside the band the validator allows
 * ONLY with secondary encoding — so the labels and the gaps between slices
 * are what make the ring readable without colour. The alternative was
 * re-colouring the three domains across the whole app, which would cost more
 * than it buys.
 *
 * The total sits in the hole, because a ring with nothing in the middle
 * wastes the one place the eye lands first.
 */
export function EffortDonut({ data }: { data: EffortSlice[] }) {
  const total = data.reduce((sum, slice) => sum + slice.minutes, 0);
  if (total === 0) return null;

  const hours = (minutes: number) => (minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <div className="relative h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="minutes"
              nameKey="name"
              innerRadius={58}
              outerRadius={86}
              paddingAngle={3}
              cornerRadius={5}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((slice) => (
                <Cell key={slice.name} fill={COLORS[slice.name] ?? "var(--muted)"} />
              ))}
            </Pie>
            <Tooltip
              separator=": "
              formatter={(value: number, name: string) => [
                `${hours(value)} (${Math.round((value / total) * 100)}%)`,
                name,
              ]}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{hours(total)}</span>
          <span className="text-[11px] text-muted">logged</span>
        </div>
      </div>

      <ul className="flex w-full flex-col gap-2.5" data-testid="effort-legend">
        {data.map((slice) => (
          <li key={slice.name} className="flex items-center gap-2.5 text-sm">
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: COLORS[slice.name] ?? "var(--muted)" }}
            />
            <span className="flex-1 truncate">{slice.name}</span>
            <span className="tabular-nums text-muted">{hours(slice.minutes)}</span>
            <span className="w-10 text-right font-semibold tabular-nums">
              {Math.round((slice.minutes / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
