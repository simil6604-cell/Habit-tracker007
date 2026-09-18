// Our own transparent 0-100 "how healthy is this product" score — the kind
// of thing apps like Yuka show, but this is not Yuka's score and not a copy
// of any proprietary algorithm (that's not published, so it can't honestly
// be reproduced). It's a simple, explainable combination of three real,
// published signals from Open Food Facts: nutritional quality (Nutri-Score),
// degree of processing (NOVA group), and additive count. Never medical
// advice — just a rough, transparent estimate with its reasoning shown.
export type ScoreBreakdown = {
  score: number; // 0-100
  nutritionPoints: number; // out of 60
  processingPoints: number; // out of 25
  additivesPoints: number; // out of 15
  notes: string[];
};

const NUTRISCORE_POINTS: Record<string, number> = { a: 60, b: 48, c: 33, d: 18, e: 6 };

const NOVA_POINTS: Record<number, number> = { 1: 25, 2: 18, 3: 10, 4: 3 };
const NOVA_LABEL: Record<number, string> = {
  1: "unprocessed or minimally processed",
  2: "processed culinary ingredients",
  3: "processed food",
  4: "ultra-processed food",
};

export function computeHealthScore(p: {
  nutriScore: string | null;
  novaGroup: number | null;
  additivesCount: number | null;
}): ScoreBreakdown {
  const notes: string[] = [];

  let nutritionPoints = 30; // neutral midpoint when Open Food Facts has no Nutri-Score for this product
  const grade = p.nutriScore?.toLowerCase();
  if (grade && NUTRISCORE_POINTS[grade] !== undefined) {
    nutritionPoints = NUTRISCORE_POINTS[grade];
    notes.push(`Nutri-Score ${grade.toUpperCase()}`);
  } else {
    notes.push("No Nutri-Score on file for this product — nutrition points set to a neutral midpoint.");
  }

  let processingPoints = 12; // neutral midpoint
  if (p.novaGroup != null && NOVA_POINTS[p.novaGroup] !== undefined) {
    processingPoints = NOVA_POINTS[p.novaGroup];
    notes.push(`NOVA group ${p.novaGroup} — ${NOVA_LABEL[p.novaGroup]}`);
  } else {
    notes.push("No processing (NOVA) classification on file — set to a neutral midpoint.");
  }

  let additivesPoints = 8; // neutral midpoint
  if (p.additivesCount != null) {
    additivesPoints = p.additivesCount === 0 ? 15 : p.additivesCount <= 2 ? 10 : p.additivesCount <= 5 ? 5 : 0;
    notes.push(`${p.additivesCount} additive${p.additivesCount === 1 ? "" : "s"} listed`);
  } else {
    notes.push("No additive list on file — set to a neutral midpoint.");
  }

  const score = Math.max(0, Math.min(100, Math.round(nutritionPoints + processingPoints + additivesPoints)));
  return { score, nutritionPoints, processingPoints, additivesPoints, notes };
}

export function scoreLabel(score: number): { label: string; className: string } {
  if (score >= 75) return { label: "Good", className: "text-success" };
  if (score >= 50) return { label: "Okay", className: "text-warning" };
  if (score >= 25) return { label: "Poor", className: "text-warning" };
  return { label: "Bad", className: "text-danger" };
}
