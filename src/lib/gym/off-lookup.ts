// Looks a barcode up against Open Food Facts (openfoodfacts.org) — a real,
// free, crowd-sourced product database. No API key needed, no fabricated
// data: if a product or field isn't in their database, we say so rather
// than inventing it.
export type OffProduct = {
  barcode: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
  nutriScore: string | null; // a..e, when Open Food Facts has computed one
  novaGroup: number | null; // 1..4 processing level
  additivesCount: number | null;
};

const TIMEOUT_MS = 8000;

export async function lookupProduct(barcode: string): Promise<OffProduct | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`, {
      headers: { "User-Agent": "OptimizeApp-PersonalUse/1.0" },
      signal: controller.signal,
    });
  } catch {
    throw new Error("Couldn't reach the product database (Open Food Facts) — check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error("Couldn't reach the product database (Open Food Facts) — check your connection and try again.");
  }

  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const p = data.product;
  return {
    barcode,
    name: p.product_name || null,
    brand: p.brands || null,
    imageUrl: p.image_front_url || p.image_url || null,
    nutriScore: typeof p.nutriscore_grade === "string" ? p.nutriscore_grade : null,
    novaGroup: typeof p.nova_group === "number" ? p.nova_group : null,
    additivesCount: Array.isArray(p.additives_tags) ? p.additives_tags.length : null,
  };
}
