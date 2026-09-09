"use client";

import dynamic from "next/dynamic";

// Recharts assigns internal ids (e.g. clipPath) from a module-level counter
// that can differ between the server and client render, causing a hydration
// mismatch that discards and remounts the whole chart. Rendering client-only
// avoids it — see calorie-gauge-chart.tsx for the first time this bit us.
export const WeeklyTimeSplitChart = dynamic(
  () => import("./weekly-time-split-chart").then((m) => m.WeeklyTimeSplitChart),
  { ssr: false, loading: () => <div style={{ height: 140 }} /> }
);
