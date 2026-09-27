"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ForecastPoint = {
  label: string;
  full: string;
  count: number;
  isToday: boolean;
  /**
   * The direct label, precomputed.
   *
   * Recharts hands a LabelList formatter the VALUE, not the row, so deciding
   * inside the formatter which bar is today is not possible — the first
   * version tried and silently rendered no label at all on every bar, which
   * only showed up by looking at the chart. Carrying the text as its own field
   * means the decision happens where the row is known.
   */
  todayLabel: string;
};

/**
 * How many cards fall due on each of the next fourteen days.
 *
 * One series, one hue — magnitude over time, so there is nothing for a second
 * colour to mean. Today is marked by a ring and a direct label rather than by
 * a different colour: colour here follows the day, and repainting whichever
 * bar happens to be tallest would be colouring by rank.
 *
 * Thin marks, rounded tops, no gridline clutter, and a hover tooltip because
 * the y-axis alone cannot tell you which day a bar is.
 */
export function DueForecastChart({ data }: { data: ForecastPoint[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <ResponsiveContainer width="100%" height={180}>
      {/*
        The top margin holds the "today" label and the left padding keeps the
        first bar off the axis: at the previous spacing that label sat on top
        of the topmost y tick and was clipped by the plot edge — visible only
        by looking at the rendered chart, not from the code.
      */}
      <BarChart data={data} margin={{ top: 24, right: 6, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10 }}
          stroke="var(--muted)"
          tickLine={false}
          interval={1}
          padding={{ left: 12, right: 4 }}
        />
        <YAxis
          allowDecimals={false}
          domain={[0, Math.max(max, 1)]}
          tick={{ fontSize: 11 }}
          stroke="var(--muted)"
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          cursor={{ fill: "var(--surface-muted)" }}
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          separator=": "
          formatter={(value: number) => [`${value} ${value === 1 ? "card" : "cards"}`, "Due"]}
          labelFormatter={(_label: string, payload) => payload?.[0]?.payload?.full ?? ""}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={18}>
          {data.map((point) => (
            <Cell
              key={point.full}
              fill="var(--cat-school)"
              stroke={point.isToday ? "var(--foreground)" : undefined}
              strokeWidth={point.isToday ? 1.5 : 0}
            />
          ))}
          {/* Selective labelling: today only, never a number on every bar. */}
          <LabelList dataKey="todayLabel" position="top" fontSize={10} fill="var(--muted)" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
