"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function HabitTrendChart({ data }: { data: { label: string; pct: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="habitTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--cat-school)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="var(--cat-school)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted)" interval={2} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="var(--muted)" unit="%" />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
        <Area type="monotone" dataKey="pct" stroke="var(--cat-school)" strokeWidth={2} fill="url(#habitTrendFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
