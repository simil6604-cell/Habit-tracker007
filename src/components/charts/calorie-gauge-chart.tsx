"use client";

import { RadialBar, RadialBarChart, PolarAngleAxis } from "recharts";

export function CalorieGaugeChart({ pct, centerValue, centerLabel }: { pct: number; centerValue: string; centerLabel: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const data = [{ value: clamped, fill: "var(--cat-gym)" }];

  return (
    <div className="relative mx-auto h-[140px] w-[220px]">
      <RadialBarChart
        width={220}
        height={140}
        cx="50%"
        cy="100%"
        innerRadius={80}
        outerRadius={110}
        barSize={16}
        startAngle={180}
        endAngle={0}
        data={data}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
        <RadialBar dataKey="value" cornerRadius={8} background={{ fill: "var(--surface-muted)" }} />
      </RadialBarChart>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="text-2xl font-bold">{centerValue}</span>
        <span className="text-xs text-muted">{centerLabel}</span>
      </div>
    </div>
  );
}
