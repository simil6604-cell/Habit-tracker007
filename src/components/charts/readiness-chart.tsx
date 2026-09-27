"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * How ready one exam has felt, day by day, up to the paper.
 *
 * A single series, so no legend — the title says what the line is. Days with no
 * reading are gaps rather than zeros: a day you didn't rate is not a day you
 * felt terrible, and a line dragged to the floor by silence is the reason
 * nobody trusts a chart like this.
 */
export function ReadinessChart({
  data,
}: {
  data: { label: string; readiness: number | null }[];
}) {
  const readings = data.filter((d) => d.readiness !== null).length;

  if (readings === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        No readings yet. Rate how ready this feels today and the line starts here.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted)" interval="preserveStartEnd" />
        <YAxis
          domain={[1, 5]}
          ticks={[1, 2, 3, 4, 5]}
          tick={{ fontSize: 11 }}
          stroke="var(--muted)"
          allowDecimals={false}
        />
        {/* 3 is "could pass, not comfortable" — the line worth crossing. */}
        <ReferenceLine y={3} stroke="var(--border)" strokeDasharray="4 4" />
        <Tooltip
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value) => [`${value} of 5`, "Felt ready"]}
        />
        <Line
          type="monotone"
          dataKey="readiness"
          stroke="var(--cat-school)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--cat-school)", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
