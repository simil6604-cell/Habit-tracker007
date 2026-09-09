"use client";

import { PieChart, Pie, Cell, Tooltip } from "recharts";

// Validated categorical dark-mode triad (blue / orange / aqua-green) — passes
// lightness band, CVD separation and contrast-vs-surface checks together as a
// set (see the dataviz skill's palette reference, slots 1–3).
const COLORS: Record<string, string> = {
  School: "#3987e5",
  Gym: "#d95926",
  Football: "#199e70",
};

export function WeeklyTimeSplitChart({ data }: { data: { name: string; minutes: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.minutes, 0);

  return (
    <div className="flex items-center gap-6">
      <ul className="flex flex-1 flex-col gap-2.5">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[d.name] }} />
            <span className="flex-1 text-muted">{d.name}</span>
            <span className="font-medium tabular-nums">{Math.round((d.minutes / total) * 100)}%</span>
          </li>
        ))}
      </ul>
      <PieChart width={140} height={140}>
        <Pie
          data={data}
          dataKey="minutes"
          nameKey="name"
          innerRadius={42}
          outerRadius={65}
          paddingAngle={3}
          cornerRadius={4}
          stroke="none"
          isAnimationActive={false}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={COLORS[d.name]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, name: string) => [`${value} min (${Math.round((value / total) * 100)}%)`, name]}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
        />
      </PieChart>
    </div>
  );
}
