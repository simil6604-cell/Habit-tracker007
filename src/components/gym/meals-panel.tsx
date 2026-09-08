"use client";

import { useRef } from "react";
import Image from "next/image";
import { createMeal, deleteMeal } from "@/lib/nutrition/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { format } from "date-fns";
import { COMMON_FOODS } from "@/lib/data/nutrition";

type Meal = { id: string; type: string; description: string; kcal: number | null; date: Date; imagePath: string | null };

const FOODS_DATALIST_ID = "common-foods";

export function MealsPanel({ meals, totalToday }: { meals: Meal[]; totalToday: number }) {
  const kcalRef = useRef<HTMLInputElement>(null);

  function onDescriptionChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (kcalRef.current?.value) return; // don't override a value the user already typed
    const match = COMMON_FOODS.find((f) => f.name.toLowerCase() === e.target.value.toLowerCase());
    if (match && kcalRef.current) kcalRef.current.value = String(match.kcal);
  }

  return (
    <div className="flex flex-col gap-3">
      <datalist id={FOODS_DATALIST_ID}>
        {COMMON_FOODS.map((f) => (
          <option key={f.name} value={f.name} />
        ))}
      </datalist>

      <form action={createMeal} className="flex flex-wrap gap-2">
        <select name="type" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
          <option value="BREAKFAST">Breakfast</option>
          <option value="LUNCH">Lunch</option>
          <option value="DINNER">Dinner</option>
          <option value="SNACK">Snack</option>
        </select>
        <input
          name="description"
          required
          placeholder="What did you eat?"
          list={FOODS_DATALIST_ID}
          onChange={onDescriptionChange}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <input
          ref={kcalRef}
          name="kcal"
          type="number"
          min={0}
          placeholder="kcal (approx.)"
          className="w-32 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <input
          name="photo"
          type="file"
          accept="image/*"
          className="w-full text-xs text-muted file:mr-2 file:rounded-lg file:border-0 file:bg-surface-muted file:px-2 file:py-1.5 file:text-xs sm:w-auto"
        />
        <Button type="submit" size="sm" variant="secondary">Log meal</Button>
      </form>
      <p className="text-xs text-muted">
        No calorie targets or crash diets here — just balanced energy for school, gym and football. Values are
        always approximate; talk to a nutrition professional for anything precise. A photo is just stored as your own
        visual log — nothing here analyzes food photos.
      </p>

      <p className="text-sm font-medium">Today: {totalToday} kcal logged</p>

      <ul className="flex flex-col divide-y divide-border">
        {meals.length === 0 && <p className="py-2 text-sm text-muted">No meals logged yet.</p>}
        {meals.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <div className="flex items-center gap-2">
              {m.imagePath && (
                <Image src={m.imagePath} alt="" width={36} height={36} className="h-9 w-9 rounded-md object-cover" unoptimized />
              )}
              <Badge>{m.type}</Badge>
              <span>{m.description}</span>
              {m.kcal !== null && <span className="text-xs text-muted">~{m.kcal} kcal</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">{format(m.date, "MMM d")}</span>
              <form action={deleteMeal.bind(null, m.id)}>
                <button type="submit" className="text-muted hover:text-danger"><Trash2 size={14} /></button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
