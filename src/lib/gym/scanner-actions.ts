"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { lookupProduct } from "./off-lookup";
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
        breakdown: ScoreBreakdown;
      };
    }
  | undefined;

export async function scanProductAction(_prevState: ScanState, formData: FormData): Promise<ScanState> {
  const userId = await requireUserId();
  const barcode = String(formData.get("barcode") ?? "").trim();
  if (!barcode) return { error: "Enter or scan a barcode first." };

  let product;
  try {
    product = await lookupProduct(barcode);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't look up this product right now." };
  }

  if (!product) {
    return { error: `No product found for barcode ${barcode} in Open Food Facts. It may not be in their database yet.` };
  }

  const breakdown = computeHealthScore(product);

  await prisma.scannedProduct.create({
    data: {
      userId,
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      imageUrl: product.imageUrl,
      nutriScore: product.nutriScore,
      novaGroup: product.novaGroup,
      healthScore: breakdown.score,
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
      breakdown,
    },
  };
}

export async function deleteScannedProduct(productId: string) {
  const userId = await requireUserId();
  await prisma.scannedProduct.deleteMany({ where: { id: productId, userId } });
  revalidatePath("/gym/scanner");
}
