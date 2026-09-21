"use client";

import { useTransition } from "react";
import { logWater, undoLastWater } from "@/lib/gym/water-actions";

const GLASS_ML = 250;

export function WaterTrackerCard({ waterTodayMl, dailyWaterGoalMl }: { waterTodayMl: number; dailyWaterGoalMl: number }) {
  const [pending, startTransition] = useTransition();
  const totalGlasses = Math.max(1, Math.round(dailyWaterGoalMl / GLASS_ML));
  const filledGlasses = Math.min(totalGlasses, Math.floor(waterTodayMl / GLASS_ML));
  const liters = (waterTodayMl / 1000).toFixed(2).replace(".", ",");
  const goalLiters = (dailyWaterGoalMl / 1000).toFixed(2).replace(".", ",");

  function addGlass() {
    startTransition(() => logWater(GLASS_ML));
  }

  function removeLast() {
    startTransition(() => undoLastWater());
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs text-muted">Goal: {goalLiters} l</p>
      <p className="text-2xl font-bold">{liters} l</p>
      <div className="flex flex-wrap justify-center gap-2">
        {Array.from({ length: totalGlasses }, (_, i) => (
          <button
            key={i}
            type="button"
            disabled={pending}
            onClick={i < filledGlasses ? removeLast : addGlass}
            title={i < filledGlasses ? "Remove a glass" : "Add a glass (250ml)"}
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition ${
              i < filledGlasses ? "bg-[var(--cat-school)]/20" : "bg-surface-muted hover:bg-border"
            }`}
          >
            💧
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">Tap a glass to log {GLASS_ML}ml — tap a filled one to undo.</p>
    </div>
  );
}
