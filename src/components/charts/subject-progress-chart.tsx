"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type SubjectRow = { name: string; fullName: string; progress: number; topicCount: number };

/**
 * Average topic progress per subject.
 *
 * Two things here were wrong before and both showed up only on a real
 * timetable:
 *
 * The axis carried the full subject name, so "German — First Language" wrapped
 * to three lines and squeezed the plot into a sliver. The labels are cut to
 * the subject upstream, and the axis is given room for what is left.
 *
 * And with every topic at 0% the chart drew a clean, empty grid — which reads
 * as a broken chart rather than as "nothing has been marked yet". It now says
 * so in words, because an empty plot is not an answer.
 */
export function SubjectProgressChart({ data }: { data: SubjectRow[] }) {
  const anyProgress = data.some((row) => row.progress > 0);

  if (!anyProgress) {
    return (
      <div className="flex flex-col gap-3 py-6">
        <p className="text-sm font-medium">No topic has any progress marked yet.</p>
        <p className="text-sm text-muted">
          A subject moves here once its topics do. Open a subject and set how far through each topic you are.
        </p>
        <ul className="mt-1 flex flex-wrap gap-1.5" data-testid="subject-chips">
          {data.map((row) => (
            <li
              key={row.fullName}
              title={row.fullName}
              className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-muted"
            >
              {row.name} · {row.topicCount} {row.topicCount === 1 ? "topic" : "topics"}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 42)}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 40, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--muted)" unit="%" tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={{ fontSize: 12 }}
          stroke="var(--muted)"
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--surface-muted)" }}
          separator=": "
          formatter={(value: number) => [`${value}%`, "Average progress"]}
          labelFormatter={(_label: string, payload) => payload?.[0]?.payload?.fullName ?? ""}
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="progress" fill="var(--cat-school)" radius={[0, 6, 6, 0]} maxBarSize={18}>
          {/* The value at the end of its own bar: reading a percentage off an
              axis is work the label can do instead. */}
          <LabelList dataKey="progress" position="right" formatter={(v: number) => `${v}%`} fontSize={11} fill="var(--muted)" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
