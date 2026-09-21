// Rough MET-based calorie-burn estimate. This is a well-known formula
// (kcal = MET × weight(kg) × hours), not a medical calculation — always
// shown as an estimate, never as a precise or medical figure.
const MET_BY_DIFFICULTY: Record<string, number> = {
  EASY: 4,
  MODERATE: 6,
  HARD: 8,
};

const DEFAULT_WEIGHT_KG = 70;

export function estimateCaloriesBurned(durationMin: number, difficulty: string | null, weightKg: number | null): number {
  const met = MET_BY_DIFFICULTY[difficulty ?? "MODERATE"] ?? 6;
  const weight = weightKg ?? DEFAULT_WEIGHT_KG;
  return Math.round(met * weight * (durationMin / 60));
}
