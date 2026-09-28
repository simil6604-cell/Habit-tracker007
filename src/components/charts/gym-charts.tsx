"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ConsistencyChart({
  data,
  color = "var(--cat-gym)",
  emptyMessage = "Nothing logged in the last eight weeks.",
}: {
  data: { week: string; sessions: number }[];
  color?: string;
  emptyMessage?: string;
}) {
  // An axis and a grid with no bars on it reads as a chart that failed to
  // load. Eight weeks of genuine zeroes is a real answer and deserves to be
  // said, not drawn as an empty box.
  if (!data.some((week) => week.sessions > 0)) {
    return (
      <p className="flex h-[220px] items-center justify-center px-4 text-center text-sm text-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: -20, right: 6, top: 6 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="var(--muted)" tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted)" tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "var(--surface-muted)" }}
          separator=": "
          formatter={(value: number) => [`${value} ${value === 1 ? "session" : "sessions"}`, "Week"]}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="sessions" fill={color} radius={[6, 6, 0, 0]} maxBarSize={30} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VolumeChart({ data }: { data: { date: string; volume: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--muted)" />
        <YAxis tick={{ fontSize: 12 }} stroke="var(--muted)" />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
        <Line type="monotone" dataKey="volume" stroke="var(--accent)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CaloriesChart({ data }: { data: { date: string; kcal: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--muted)" />
        <YAxis tick={{ fontSize: 12 }} stroke="var(--muted)" />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
        <Line type="monotone" dataKey="kcal" stroke="var(--cat-exam)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
