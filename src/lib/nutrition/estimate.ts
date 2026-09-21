"use server";

import { auth } from "@/lib/auth/auth";
import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";

export type MealEstimate =
  | {
      ok: true;
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      /** What the AI assumed — portion sizes, cooking method, anything it had to guess. */
      assumptions: string;
    }
  | { ok: false; error: string };

const SYSTEM = [
  "You estimate the nutrition of a meal a student describes or photographs, for their own food diary.",
  "Reply with ONLY a JSON object, no prose and no code fence, shaped exactly:",
  '{"kcal": number, "proteinG": number, "carbsG": number, "fatG": number, "assumptions": string}',
  "Numbers are whole numbers for the WHOLE meal described, not per 100g.",
  "In `assumptions`, state plainly what you had to guess — portion size, cooking fat, whether a photo was clear — in one short sentence.",
  "These are rough estimates, never measured values. If the description is far too vague to estimate at all (for example just \"food\" or \"lunch\"), reply exactly {\"error\": \"too vague\"} instead of inventing numbers.",
  "Never give diet advice, calorie targets, or comments about the student's body here — only the numbers and your assumptions.",
].join("\n");

/**
 * Turns "chicken rice and broccoli" or a photo of the plate into macros, so the
 * student doesn't have to look four numbers up by hand. Deliberately refuses
 * rather than guessing when there isn't enough to go on.
 */
export async function estimateMealNutrition(
  description: string,
  imageDataUrl?: string | null
): Promise<MealEstimate> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const trimmed = description.trim();
  if (!trimmed && !imageDataUrl) {
    return { ok: false, error: "Describe the meal or add a photo first." };
  }
  if (!isRealAIConfigured) {
    return {
      ok: false,
      error:
        "Estimating from text or a photo needs a connected AI — set ANTHROPIC_API_KEY in Settings. Until then, type the numbers in yourself.",
    };
  }

  const context: Record<string, unknown> = { system: SYSTEM, maxTokens: 400 };
  if (imageDataUrl) {
    const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(imageDataUrl);
    if (!match) {
      return { ok: false, error: "That image format isn't supported — use a JPEG, PNG or WebP photo." };
    }
    context.imageMediaType = match[1];
    context.imageBase64 = match[2];
  }

  const prompt = imageDataUrl
    ? `This is a photo of the meal.${trimmed ? ` The student also describes it as: "${trimmed}".` : ""} Estimate its nutrition.`
    : `The student ate: "${trimmed}". Estimate its nutrition.`;

  let raw: string;
  try {
    raw = await getAIProvider().generate(prompt, context);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach the AI service." };
  }

  // Models sometimes wrap JSON in a fence despite instructions.
  const jsonText = raw.replace(/```json\s*|```/g, "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "The AI didn't return usable numbers — try describing the meal a bit more fully." };
  }

  if (typeof parsed.error === "string") {
    return {
      ok: false,
      error: "That's too vague to estimate — add what it was and roughly how much (e.g. \"200g chicken, rice, salad\").",
    };
  }

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
  const kcal = num(parsed.kcal);
  const proteinG = num(parsed.proteinG);
  const carbsG = num(parsed.carbsG);
  const fatG = num(parsed.fatG);

  if (kcal === null || proteinG === null || carbsG === null || fatG === null) {
    return { ok: false, error: "The AI's answer was incomplete — try again." };
  }

  return {
    ok: true,
    kcal,
    proteinG,
    carbsG,
    fatG,
    assumptions: typeof parsed.assumptions === "string" ? parsed.assumptions : "",
  };
}
