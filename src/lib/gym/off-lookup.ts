/**
 * Looking a barcode up in the open product databases.
 *
 * Open Food Facts for food and Open Beauty Facts for cosmetics: both are
 * free, crowd-sourced and need no key. Nothing here is invented — a field
 * that is not in their data is reported as missing rather than filled in.
 *
 * Two databases rather than one because of what people actually scan. The
 * app only ever asked the food database, so a shampoo, a deodorant or a
 * sunscreen came back as "no product found" — which reads as the scanner
 * being broken rather than as the shelf being the wrong one. This is also
 * exactly what the well-known scanning apps do: they are built on these
 * same open databases, which have no commercial API to connect to.
 */
export type ProductSource = "food" | "beauty";

export type OffProduct = {
  barcode: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
  nutriScore: string | null; // a..e, when Open Food Facts has computed one
  novaGroup: number | null; // 1..4 processing level
  additivesCount: number | null;
  /** Which database answered — the two are scored differently. */
  source: ProductSource;
};

const TIMEOUT_MS = 8000;

/**
 * Where to ask.
 *
 * Overridable so the whole path can be driven against a stand-in while
 * testing, which is the only way to prove this works without depending on
 * someone else's service being up.
 */
export function foodBaseUrl(): string {
  return (process.env.OFF_BASE_URL?.trim() || "https://world.openfoodfacts.org").replace(/\/+$/, "");
}

export function beautyBaseUrl(): string {
  return (process.env.OBF_BASE_URL?.trim() || "https://world.openbeautyfacts.org").replace(/\/+$/, "");
}

/**
 * Only the fields that are used.
 *
 * Asked for by name because the full product record is hundreds of
 * kilobytes of translations and tags, and on a phone on mobile data that is
 * the difference between a scan that feels instant and one that does not.
 */
const FIELDS = [
  "product_name",
  "product_name_en",
  "product_name_de",
  "brands",
  "image_front_url",
  "image_url",
  "nutriscore_grade",
  "nova_group",
  "additives_tags",
].join(",");

/**
 * A barcode is digits, and nothing else.
 *
 * It goes into a URL and then into a request to someone else's server, so
 * it is checked rather than escaped-and-hoped-about. EAN-8 through to
 * ITF-14 is 8 to 14 digits; a few own-brand codes are shorter.
 */
export function isBarcode(raw: string): boolean {
  return /^\d{6,14}$/.test(raw.trim());
}

export class ProductLookupError extends Error {
  /** True when the database was reached and simply does not know the code. */
  readonly notFound: boolean;
  constructor(message: string, notFound = false) {
    super(message);
    this.notFound = notFound;
    this.name = "ProductLookupError";
  }
}

const UNREACHABLE =
  "Couldn't reach the product databases (Open Food Facts and Open Beauty Facts) — check your connection and try again.";

type Fetcher = typeof fetch;

async function askOne(
  base: string,
  barcode: string,
  source: ProductSource,
  doFetch: Fetcher
): Promise<OffProduct | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await doFetch(
      `${base}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${encodeURIComponent(FIELDS)}`,
      {
        // Open Food Facts asks every client to identify itself. It names the
        // app and nothing about whoever is holding the phone.
        headers: { "User-Agent": "Momentum-PersonalRevisionApp/1.0" },
        signal: controller.signal,
      }
    );
  } catch {
    throw new ProductLookupError(UNREACHABLE);
  } finally {
    clearTimeout(timeout);
  }

  // A barcode they have never seen answers 404 on this endpoint, and that is
  // an answer rather than a failure to reach them: reported as a connection
  // error it sends you to check a connection that is fine.
  if (res.status === 404) return null;
  if (!res.ok) throw new ProductLookupError(UNREACHABLE);

  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new ProductLookupError(UNREACHABLE);
  }

  const product = data.product as Record<string, unknown> | undefined;
  if (data.status !== 1 || !product) return null;

  const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  return {
    barcode,
    // The name in a language this student reads, where there is one.
    name: text(product.product_name) ?? text(product.product_name_en) ?? text(product.product_name_de),
    brand: text(product.brands),
    imageUrl: text(product.image_front_url) ?? text(product.image_url),
    nutriScore: text(product.nutriscore_grade),
    novaGroup: typeof product.nova_group === "number" ? product.nova_group : null,
    additivesCount: Array.isArray(product.additives_tags) ? product.additives_tags.length : null,
    source,
  };
}

/**
 * Food first, then cosmetics.
 *
 * In that order because most scans in a gym app are food, and the second
 * request only happens when the first comes back empty. A database that
 * cannot be reached is an error; one that answers "never heard of it" is
 * not, and the next one is tried.
 */
export async function lookupProduct(
  barcode: string,
  options: { fetch?: Fetcher } = {}
): Promise<OffProduct | null> {
  const code = barcode.trim();
  if (!isBarcode(code)) {
    throw new ProductLookupError(
      `"${barcode}" is not a barcode — it should be the 8 to 13 digits printed under the bars.`
    );
  }
  const doFetch = options.fetch ?? fetch;

  const food = await askOne(foodBaseUrl(), code, "food", doFetch);
  if (food) return food;

  return askOne(beautyBaseUrl(), code, "beauty", doFetch);
}

export type ConnectionCheck = {
  ok: boolean;
  /** What happened, in a sentence someone can act on. */
  detail: string;
};

/**
 * Whether the product databases can be reached from wherever this app runs.
 *
 * Here because the answer is different on the phone and on the server, and
 * only the server's answer matters — the lookup happens there. Without this
 * a scan that fails is indistinguishable from a barcode nobody has catalogued,
 * and the two have completely different fixes.
 *
 * It uses a real product (Nutella, the most catalogued barcode there is), so
 * a success means the whole path works, not just that a host answered.
 */
export const CHECK_BARCODE = "3017620422003";

export async function checkProductDatabase(options: { fetch?: Fetcher } = {}): Promise<ConnectionCheck> {
  try {
    const product = await lookupProduct(CHECK_BARCODE, options);
    if (!product) {
      return {
        ok: false,
        detail:
          "The product database answered, but did not know a barcode it certainly has. Something is sitting between this app and them — a proxy, or a block.",
      };
    }
    return {
      ok: true,
      detail: `Reached Open Food Facts and it knows ${product.name ?? "the test product"}${
        product.brand ? ` (${product.brand})` : ""
      }. Scanning works from here.`,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : UNREACHABLE };
  }
}
