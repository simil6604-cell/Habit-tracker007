"use client";

import dynamic from "next/dynamic";

/**
 * Client-only, for the same reason the weekly split is: Recharts builds
 * internal ids from a module-level counter that can differ between the server
 * and client render, and the mismatch throws the whole chart away and remounts
 * it.
 */
export const EffortDonut = dynamic(() => import("./effort-donut").then((m) => m.EffortDonut), {
  ssr: false,
  loading: () => <div style={{ height: 180 }} />,
});
