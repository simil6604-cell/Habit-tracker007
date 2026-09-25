"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createMeal, deleteMeal, type MealFormState } from "@/lib/nutrition/actions";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { COMMON_FOODS } from "@/lib/data/nutrition";
import { estimateMealNutrition } from "@/lib/nutrition/estimate";
import type { MealTypeSummary } from "@/lib/gym/nutrition-summary";
import { currentMealType } from "@/lib/gym/meal-time";

type Meal = {
  id: string;
  type: string;
  description: string;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  date: Date;
  imagePath: string | null;
  estimated?: boolean;
};

const TYPE_META: Record<string, { label: string; emoji: string }> = {
  BREAKFAST: { label: "Breakfast", emoji: "☕" },
  LUNCH: { label: "Lunch", emoji: "🍝" },
  DINNER: { label: "Dinner", emoji: "🥗" },
  SNACK: { label: "Snacks", emoji: "🍎" },
};

const FOODS_DATALIST_ID = "common-foods";

/** Server actions take plain data, so the photo travels as a data URL. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function MealTypeRow({
  breakdown,
  meals,
  defaultOpen = false,
}: {
  breakdown: MealTypeSummary;
  meals: Meal[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // A photo that can't be saved has to say so — silently logging the meal
  // without it is how "I can't add a photo" turns into a mystery.
  const [mealState, mealAction] = useActionState<MealFormState, FormData>(createMeal, undefined);
  // The parent only learns the time of day after mount, so defaultOpen arrives
  // one render late — useState alone would keep the initial false forever.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const kcalRef = useRef<HTMLInputElement>(null);
  const proteinRef = useRef<HTMLInputElement>(null);
  const carbsRef = useRef<HTMLInputElement>(null);
  const fatRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateNote, setEstimateNote] = useState<string | null>(null);
  const [estimateError, setEstimateError] = useState(false);
  const [estimated, setEstimated] = useState(false);
  const meta = TYPE_META[breakdown.type];
  const pct = breakdown.targetKcal ? Math.min(100, Math.round((breakdown.consumedKcal / breakdown.targetKcal) * 100)) : 0;

  async function estimateWithAI() {
    const description = descriptionRef.current?.value ?? "";
    const file = photoRef.current?.files?.[0] ?? null;

    setEstimating(true);
    setEstimateError(false);
    setEstimateNote(null);
    try {
      const imageDataUrl = file ? await fileToDataUrl(file) : null;
      const result = await estimateMealNutrition(description, imageDataUrl);
      if (!result.ok) {
        setEstimateError(true);
        setEstimateNote(result.error);
        return;
      }
      if (kcalRef.current) kcalRef.current.value = String(result.kcal);
      if (proteinRef.current) proteinRef.current.value = String(result.proteinG);
      if (carbsRef.current) carbsRef.current.value = String(result.carbsG);
      if (fatRef.current) fatRef.current.value = String(result.fatG);
      setEstimated(true);
      setEstimateNote(
        `Rough estimate — adjust anything that looks off.${result.assumptions ? ` ${result.assumptions}` : ""}`
      );
    } finally {
      setEstimating(false);
    }
  }

  function onDescriptionChange(e: React.ChangeEvent<HTMLInputElement>) {
    const match = COMMON_FOODS.find((f) => f.name.toLowerCase() === e.target.value.toLowerCase());
    if (!match) return;
    if (kcalRef.current && !kcalRef.current.value) kcalRef.current.value = String(match.kcal);
    if (proteinRef.current && !proteinRef.current.value) proteinRef.current.value = String(match.proteinG);
    if (carbsRef.current && !carbsRef.current.value) carbsRef.current.value = String(match.carbsG);
    if (fatRef.current && !fatRef.current.value) fatRef.current.value = String(match.fatG);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 text-left">
        <div
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(var(--cat-gym) ${pct * 3.6}deg, var(--surface-muted) 0deg)` }}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-lg">{meta.emoji}</div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{meta.label}</p>
          <p className="truncate text-xs text-muted">
            {breakdown.consumedKcal}{breakdown.targetKcal !== null ? ` / ${breakdown.targetKcal}` : ""} kcal
            {breakdown.lastDescription ? ` · ${breakdown.lastDescription}` : ""}
          </p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-lg hover:bg-border">+</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <datalist id={FOODS_DATALIST_ID}>
            {COMMON_FOODS.map((f) => (
              <option key={f.name} value={f.name} />
            ))}
          </datalist>
          <form action={mealAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="type" value={breakdown.type} />
            <input
              ref={descriptionRef}
              name="description"
              required
              placeholder="What did you eat? Write it however you like…"
              list={FOODS_DATALIST_ID}
              onChange={onDescriptionChange}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            {/* The datalist pops a suggestion list as soon as you type, which
                reads as though the app only accepts what's on it. It doesn't. */}
            <p className="w-full text-xs text-muted">
              Type anything — the suggestions are only a shortcut that fills the numbers for you. Leave the numbers
              blank and use ✨ Estimate with AI, or fill them in yourself.
            </p>
            <input ref={kcalRef} name="kcal" type="number" min={0} placeholder="kcal" className="w-20 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input ref={proteinRef} name="proteinG" type="number" min={0} placeholder="protein g" className="w-24 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input ref={carbsRef} name="carbsG" type="number" min={0} placeholder="carbs g" className="w-24 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input ref={fatRef} name="fatG" type="number" min={0} placeholder="fat g" className="w-20 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input
              ref={photoRef}
              name="photo"
              type="file"
              accept="image/*"
              className="w-full text-xs text-muted file:mr-2 file:rounded-lg file:border-0 file:bg-surface-muted file:px-2 file:py-1.5 file:text-xs sm:w-auto"
            />
            <input type="hidden" name="estimated" value={estimated ? "1" : ""} />
            <Button type="button" size="sm" variant="outline" disabled={estimating} onClick={estimateWithAI}>
              {estimating ? "Estimating…" : "✨ Estimate with AI"}
            </Button>
            <Button type="submit" size="sm" variant="secondary">Log</Button>
          </form>

          {mealState?.error && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger" data-testid="meal-error">
              {mealState.error}
            </p>
          )}

          {estimateNote && (
            <p className={`text-xs ${estimateError ? "text-danger" : "text-muted"}`}>{estimateNote}</p>
          )}

          {meals.length > 0 && (
            <ul className="flex flex-col divide-y divide-border">
              {meals.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    {m.imagePath && (
                      <Image src={m.imagePath} alt="" width={28} height={28} className="h-7 w-7 rounded-md object-cover" unoptimized />
                    )}
                    <span>{m.description}</span>
                    {m.kcal !== null && <span className="text-muted">~{m.kcal} kcal</span>}
                    {m.proteinG !== null && <span className="text-muted">{m.proteinG}g protein</span>}
                    {m.estimated && (
                      <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] text-muted">
                        AI estimate
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted">{format(m.date, "HH:mm")}</span>
                    <form action={deleteMeal.bind(null, m.id)}>
                      <button type="submit" className="text-muted hover:text-danger">
                        <Trash2 size={12} />
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function MealsByTypePanel({ meals, breakdown }: { meals: Meal[]; breakdown: MealTypeSummary[] }) {
  // Decided after mount, from the clock on your device: the server runs in UTC
  // and would open the wrong meal for anyone who isn't. Rendering the same
  // thing on both sides first also avoids a hydration mismatch.
  const [nowMealType, setNowMealType] = useState<string | null>(null);
  useEffect(() => setNowMealType(currentMealType(new Date().getHours())), []);

  return (
    <div className="flex flex-col gap-2">
      {breakdown.map((b) => (
        <MealTypeRow
          key={b.type}
          breakdown={b}
          meals={meals.filter((m) => m.type === b.type)}
          defaultOpen={b.type === nowMealType}
        />
      ))}
      <p className="mt-1 text-xs text-muted">
        Meal-type targets are just a common rule-of-thumb share of your own daily goal (not measured or
        prescribed) — no crash diets here. Values are always approximate; a photo is just your own visual log,
        never analyzed.
      </p>
    </div>
  );
}
