"use client";

import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";

export function WeightChart({ data, targetWeightKg }: { data: { date: string; weightKg: number }[]; targetWeightKg?: number | null }) {
  const values = data.map((d) => d.weightKg);
  if (targetWeightKg != null) values.push(targetWeightKg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const domain: [number, number] = [Math.floor(min - 2), Math.ceil(max + 2)];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--muted)" />
        <YAxis domain={domain} tick={{ fontSize: 12 }} stroke="var(--muted)" />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
        {targetWeightKg != null && (
          <ReferenceLine y={targetWeightKg} stroke="var(--accent)" strokeDasharray="4 4" label={{ value: "Target", fontSize: 11, fill: "var(--accent)" }} />
        )}
        <Line type="monotone" dataKey="weightKg" stroke="var(--cat-gym)" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
