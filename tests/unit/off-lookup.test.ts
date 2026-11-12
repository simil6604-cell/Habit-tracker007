import { afterEach, describe, expect, it, vi } from "vitest";
import {
  barcodeVariants,
  normalizeBarcode,
  CHECK_BARCODE,
  checkProductDatabase,
  isBarcode,
  lookupProduct,
  ProductLookupError,
} from "@/lib/gym/off-lookup";

/**
 * Looking a barcode up, without anyone else's server.
 *
 * The lookup is the half of the scanner that can actually be tested: the
 * camera belongs to the phone, but which databases are asked, in which
 * order, and what is believed back is this app's own logic — and it is the
 * part that was wrong. Only food was ever asked, so a shampoo came back as
 * "no product found" and read as a broken scanner.
 */

const asked: string[] = [];

function server(responses: Record<string, { status: number; body?: unknown }>) {
  return vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    asked.push(href);
    const key = Object.keys(responses).find((host) => href.includes(host));
    const reply = key ? responses[key] : { status: 404 };
    return new Response(reply.body === undefined ? "" : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const nutella = {
  status: 1,
  product: {
    product_name: "Nutella",
    brands: "Ferrero",
    image_front_url: "https://images.example/nutella.jpg",
    nutriscore_grade: "e",
    nova_group: 4,
    additives_tags: ["en:e322", "en:e476"],
  },
};

const shampoo = {
  status: 1,
  product: { product_name: "Shampoo", brands: "Some Brand", image_url: "https://images.example/shampoo.jpg" },
};

afterEach(() => {
  asked.length = 0;
});

describe("a barcode", () => {
  it("is digits, and only digits", () => {
    expect(isBarcode("3017620422003")).toBe(true);
    expect(isBarcode(" 4001686301203 ")).toBe(true);
    expect(isBarcode("12345")).toBe(false);
    expect(isBarcode("300762042200399")).toBe(false);
    expect(isBarcode("../../etc/passwd")).toBe(false);
    expect(isBarcode("3017620422003; DROP")).toBe(false);
  });

  it("that isn't one never reaches anyone else's server", async () => {
    const fetchMock = server({});
    await expect(lookupProduct("not-a-barcode", { fetch: fetchMock })).rejects.toThrow(/not a barcode/i);
    expect(asked).toEqual([]);
  });
});

describe("where it looks", () => {
  it("asks the food database first and takes the answer", async () => {
    const product = await lookupProduct("3017620422003", {
      fetch: server({ openfoodfacts: { status: 200, body: nutella } }),
    });

    expect(product).toMatchObject({
      barcode: "3017620422003",
      name: "Nutella",
      brand: "Ferrero",
      nutriScore: "e",
      novaGroup: 4,
      additivesCount: 2,
      source: "food",
    });
    // One request, not two: cosmetics are only asked about when food has
    // nothing, so an ordinary scan still costs a single round trip.
    expect(asked).toHaveLength(1);
  });

  it("asks the cosmetics database when food has never heard of it", async () => {
    const product = await lookupProduct("4005900123456", {
      fetch: server({ openbeautyfacts: { status: 200, body: shampoo } }),
    });

    expect(product).toMatchObject({ name: "Shampoo", source: "beauty" });
    expect(asked[0]).toContain("openfoodfacts");
    expect(asked[1]).toContain("openbeautyfacts");
  });

  it("says plainly that neither knows it, rather than failing", async () => {
    // A crowd-sourced database simply not having a product is an answer.
    expect(await lookupProduct("1234567890123", { fetch: server({}) })).toBeNull();
  });

  it("reads a 'status: 0' body as not found, the way their API answers", async () => {
    const product = await lookupProduct("1234567890123", {
      fetch: server({
        openfoodfacts: { status: 200, body: { status: 0, status_verbose: "product not found" } },
        openbeautyfacts: { status: 200, body: { status: 0 } },
      }),
    });
    expect(product).toBeNull();
  });

  it("calls an unreachable database unreachable, which is a different problem", async () => {
    const dead = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(lookupProduct("3017620422003", { fetch: dead })).rejects.toBeInstanceOf(ProductLookupError);
    await expect(lookupProduct("3017620422003", { fetch: dead })).rejects.toThrow(/couldn't reach/i);
  });
});

describe("what it sends", () => {
  it("asks for the fields it uses and nothing else", async () => {
    await lookupProduct("3017620422003", { fetch: server({ openfoodfacts: { status: 200, body: nutella } }) });
    expect(asked[0]).toContain("fields=");
    expect(decodeURIComponent(asked[0])).toContain("nutriscore_grade");
  });

  it("identifies the app and says nothing about whoever is holding the phone", async () => {
    const seen: Record<string, string>[] = [];
    const watching = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push((init?.headers ?? {}) as Record<string, string>);
      return new Response(JSON.stringify(nutella), { status: 200 });
    }) as unknown as typeof fetch;

    await lookupProduct("3017620422003", { fetch: watching });
    const agent = seen[0]["User-Agent"];
    expect(agent).toBeTruthy();
    expect(agent).not.toMatch(/@/);
  });
});

describe("the connection test", () => {
  it("passes when a product it certainly has comes back", async () => {
    const check = await checkProductDatabase({
      fetch: server({ openfoodfacts: { status: 200, body: nutella } }),
    });
    expect(check.ok).toBe(true);
    expect(check.detail).toContain("Nutella");
  });

  it("fails loudly when something sits between this app and them", async () => {
    // Reached, but answering "never heard of it" about the most catalogued
    // barcode there is — which is what a filtering proxy looks like.
    const check = await checkProductDatabase({ fetch: server({}) });
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/proxy|block/i);
  });

  it("fails with the connection message when nothing answers", async () => {
    const dead = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const check = await checkProductDatabase({ fetch: dead });
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/couldn't reach/i);
  });

  it("uses a barcode that really exists", () => {
    expect(isBarcode(CHECK_BARCODE)).toBe(true);
  });
});

describe("a barcode as the packet prints it", () => {
  it("is read with the gaps it is printed with", () => {
    // This is what "typing the code doesn't work" was. An EAN-13 is printed
    // "4 006381 333931" and that is what anyone copying it types, because
    // it is what they are reading.
    expect(normalizeBarcode("4 006381 333931")).toBe("4006381333931");
    expect(isBarcode("4 006381 333931")).toBe(true);
    expect(normalizeBarcode("40-06381-333931")).toBe("4006381333931");
    expect(normalizeBarcode("4.006381.333931")).toBe("4006381333931");
  });

  it("still refuses something that is not a barcode at all", () => {
    expect(isBarcode("not a barcode")).toBe(false);
    expect(isBarcode("12 34")).toBe(false);
    expect(isBarcode("../../etc/passwd")).toBe(false);
  });

  it("is looked up with its gaps taken out", async () => {
    const product = await lookupProduct("3017 6204 22003", {
      fetch: server({ openfoodfacts: { status: 200, body: nutella } }),
    });
    expect(product?.name).toBe("Nutella");
    expect(asked[0]).toContain("3017620422003");
  });
});

describe("the other code the same product might be under", () => {
  it("knows a UPC-A is an EAN with a zero in front", () => {
    expect(barcodeVariants("012345678905")).toContain("0012345678905");
    expect(barcodeVariants("0012345678905")).toContain("012345678905");
    // The code as printed is always tried first, so the ordinary case is
    // still one request.
    expect(barcodeVariants("4006381333931")[0]).toBe("4006381333931");
    expect(barcodeVariants("4006381333931")).toHaveLength(1);
  });

  it("finds a product filed under the padded code", async () => {
    // Asked for only the twelve digits on the packet, this came back as
    // "no product found" for something that is definitely in there.
    const product = await lookupProduct("012345678905", {
      fetch: vi.fn(async (url: string | URL | Request) => {
        const href = String(url);
        asked.push(href);
        const known = href.includes("0012345678905");
        return new Response(JSON.stringify(known ? nutella : { status: 0 }), { status: known ? 200 : 404 });
      }) as unknown as typeof fetch,
    });
    expect(product?.name).toBe("Nutella");
  });
});
