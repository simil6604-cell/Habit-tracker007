import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProductScannerPanel } from "@/components/gym/product-scanner-panel";

export default async function ProductScannerPage() {
  const session = await auth();
  const userId = session!.user.id;

  const history = await prisma.scannedProduct.findMany({
    where: { userId },
    orderBy: { scannedAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Product Scanner</h1>
          <p className="mt-1 text-muted">Scan or type a barcode to see a 0–100 health score for that product.</p>
        </div>
        <Link href="/gym"><Button variant="outline">Back to Gym</Button></Link>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Scan a product</CardTitle></CardHeader>
        <CardContent>
          <ProductScannerPanel history={history} />
        </CardContent>
      </Card>
    </div>
  );
}
