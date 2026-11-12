"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import {
  checkProductDatabase,
  lookupProduct,
  normalizeBarcode,
  type ConnectionCheck,
  type ProductSource,
} from "./off-lookup";
import { computeHealthScore, type ScoreBreakdown } from "./health-score";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type ScanState =
  | {
      error?: string;
      result?: {
        barcode: string;
        name: string | null;
        brand: string | null;
        imageUrl: string | null;
        nutriScore: string | null;
        novaGroup: number | null;
        source: ProductSource;
        /**
         * Null for anything that is not food. The score is built from
         * Nutri-Score, NOVA and additive count, and a cosmetic has none of
         * them — a number there would be a health claim about a shampoo.
         */
        breakdown: ScoreBreakdown | null;
      };
    }
  | undefined;

export async function scanProductAction(_prevState: ScanState, formData: FormData): Promise<ScanState> {
  const userId = await requireUserId();
  // Normalised here as well as in the lookup, so what is stored and shown
  // back is the barcode rather than however it was typed.
  const barcode = normalizeBarcode(String(formData.get("barcode") ?? "").trim());
  if (!barcode) return { error: "Enter or scan a barcode first." };

  let product;
  try {
    product = await lookupProduct(barcode);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't look up this product right now." };
  }

  if (!product) {
    return {
      error: `Neither Open Food Facts nor Open Beauty Facts has barcode ${barcode} on file. Both are crowd-sourced, so a product can simply not be in them yet — you can add it on their site and it works here afterwards.`,
    };
  }

  // Cosmetics are listed but not scored: see the note on the type above.
  const breakdown = product.source === "food" ? computeHealthScore(product) : null;

  await prisma.scannedProduct.create({
    data: {
      userId,
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      imageUrl: product.imageUrl,
      nutriScore: product.nutriScore,
      novaGroup: product.novaGroup,
      healthScore: breakdown?.score ?? null,
      source: product.source,
    },
  });

  revalidatePath("/gym/scanner");
  revalidatePath("/gym");

  return {
    result: {
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      imageUrl: product.imageUrl,
      nutriScore: product.nutriScore,
      novaGroup: product.novaGroup,
      source: product.source,
      breakdown,
    },
  };
}

/**
 * Whether this app can reach the product databases at all, right now.
 *
 * Asked for because a failed scan has two completely different causes that
 * look identical from the phone: a barcode nobody has catalogued, or an app
 * that cannot get out to the internet at all. This settles which, from the
 * server, where the lookup actually happens.
 */
export async function testProductDatabase(): Promise<ConnectionCheck> {
  // Signed in only: it makes an outbound request on this app's behalf.
  await requireUserId();
  return checkProductDatabase();
}

export async function deleteScannedProduct(productId: string) {
  const userId = await requireUserId();
  await prisma.scannedProduct.deleteMany({ where: { id: productId, userId } });
  revalidatePath("/gym/scanner");
}
