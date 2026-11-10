import { createServer, type Server } from "node:http";

/**
 * A stand-in for the open product databases.
 *
 * The scanner's whole job is to ask someone else's server about a barcode,
 * and the suite must not depend on that server being up, fast, or reachable
 * from wherever the tests run. So it is replaced by this, and OFF_BASE_URL /
 * OBF_BASE_URL point the app at it — the same trick the Claude and
 * ElevenLabs paths are tested with.
 *
 * Only the barcodes below exist. Everything else answers the way these APIs
 * really answer for a product they have never seen, which is the case the
 * app has to handle gracefully.
 */

export const FOOD_PORT = 4016;
export const BEAUTY_PORT = 4017;

/** Nutella: the most catalogued barcode there is, and the one the app's own connection test uses. */
export const FOOD_BARCODE = "3017620422003";
/** A cosmetic, which only exists in the beauty database. */
export const BEAUTY_BARCODE = "4005900123456";
/** In neither of them. */
export const UNKNOWN_BARCODE = "9999999999999";

const FOOD = {
  status: 1,
  product: {
    product_name: "Nutella",
    brands: "Ferrero",
    nutriscore_grade: "e",
    nova_group: 4,
    additives_tags: ["en:e322", "en:e476"],
  },
};

const BEAUTY = {
  status: 1,
  product: { product_name: "Nivea Shampoo", brands: "Nivea" },
};

function stub(known: Record<string, unknown>, port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const match = /\/api\/v2\/product\/(\d+)\.json/.exec(req.url ?? "");
    const body = match ? known[match[1]] : undefined;
    res.writeHead(body ? 200 : 404, { "Content-Type": "application/json" });
    // Their API answers a missing product with a body saying so, not only
    // with a status code — both paths matter, so both are exercised.
    res.end(JSON.stringify(body ?? { status: 0, status_verbose: "product not found" }));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

export async function startProductStubs(): Promise<() => Promise<void>> {
  const servers = await Promise.all([
    stub({ [FOOD_BARCODE]: FOOD }, FOOD_PORT),
    stub({ [BEAUTY_BARCODE]: BEAUTY }, BEAUTY_PORT),
  ]);
  return async () => {
    await Promise.all(servers.map((server) => new Promise<void>((done) => server.close(() => done()))));
  };
}
