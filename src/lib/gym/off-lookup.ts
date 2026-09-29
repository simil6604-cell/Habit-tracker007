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

  // A barcode Open Food Facts has never seen answers 404 on this endpoint,
  // and that is an answer, not a failure to reach them: reported as a
  // connection error it sends you to check a connection that is fine. Their
  // API could not be called from here to confirm the exact code, so the
  // "no such product" path is taken from the body as well, below.
  if (res.status === 404) return null;

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
