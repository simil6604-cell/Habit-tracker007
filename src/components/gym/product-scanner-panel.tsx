"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import {
  scanProductAction,
  deleteScannedProduct,
  testProductDatabase,
  type ScanState,
} from "@/lib/gym/scanner-actions";
import { scoreLabel } from "@/lib/gym/health-score";
import { Button } from "@/components/ui/button";
import { BarcodeScanner } from "./barcode-scanner";

type ScannedProduct = {
  id: string;
  barcode: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
  healthScore: number | null;
  source?: string;
  scannedAt: Date;
};

export function ProductScannerPanel({ history }: { history: ScannedProduct[] }) {
  const [state, formAction, pending] = useActionState<ScanState, FormData>(scanProductAction, undefined);
  // Whether this app can reach the databases at all — a different question
  // from whether a particular barcode is in them, and the one people
  // actually mean when they say the scanner does not work.
  const [check, setCheck] = useState<{ ok: boolean; detail: string } | null>(null);
  const [checking, startCheck] = useTransition();
  const barcodeRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleDetected(barcode: string) {
    if (barcodeRef.current) barcodeRef.current.value = barcode;
    formRef.current?.requestSubmit();
  }

  return (
    <div className="flex flex-col gap-4">
      <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-muted">Barcode</label>
          <input
            ref={barcodeRef}
            name="barcode"
            required
            // A barcode is digits, so a phone should offer the number pad —
            // and the pattern allows the spaces the packet prints, which are
            // taken out before anything is looked up.
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 3017620422003"
            className="w-48 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Looking up…" : "Look up"}
        </Button>
      </form>

      <BarcodeScanner onDetected={handleDetected} />

      <p className="text-xs text-muted">
        Looks the barcode up in Open Food Facts and, for anything that isn&apos;t food, Open Beauty Facts — real,
        free, crowd-sourced databases, never invented product data. These are the same open databases the
        well-known scanning apps are built on; none of them has a public API to connect to. The 0–100 score is this
        app&apos;s own transparent estimate (not Yuka&apos;s score, and not medical advice), built from Nutri-Score,
        processing level (NOVA) and additive count when Open Food Facts has that data on file. Cosmetics are shown
        but not scored.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={checking}
          onClick={() => startCheck(async () => setCheck(await testProductDatabase()))}
        >
          {checking ? "Checking…" : "Test the product database"}
        </Button>
        {check && (
          <span
            className={`text-xs ${check.ok ? "text-muted" : "text-danger"}`}
            data-testid="product-db-check"
          >
            {check.detail}
          </span>
        )}
      </div>

      {state?.error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}

      {state?.result && (
        <div className="flex gap-3 rounded-xl border border-border p-4">
          {state.result.imageUrl && (
            <Image
              src={state.result.imageUrl}
              alt=""
              width={72}
              height={72}
              className="h-[72px] w-[72px] shrink-0 rounded-lg object-cover"
              unoptimized
            />
          )}
          <div className="flex-1">
            <p className="font-medium">{state.result.name ?? "Unknown product"}</p>
            {state.result.brand && <p className="text-xs text-muted">{state.result.brand}</p>}
            {state.result.breakdown ? (
              <>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-3xl font-bold ${scoreLabel(state.result.breakdown.score).className}`}>
                    {state.result.breakdown.score}
                  </span>
                  <span className="text-xs text-muted">
                    /100 · {scoreLabel(state.result.breakdown.score).label}
                  </span>
                </div>
                <ul className="mt-2 flex flex-col gap-0.5 text-xs text-muted">
                  {state.result.breakdown.notes.map((n, i) => (
                    <li key={i}>• {n}</li>
                  ))}
                </ul>
              </>
            ) : (
              // A cosmetic. It is found and listed, and deliberately not
              // scored: the 0-100 here is built from Nutri-Score, NOVA and
              // additives, and inventing one for a shampoo would be a health
              // claim with nothing behind it.
              <p className="mt-2 text-xs text-muted">
                Found in Open Beauty Facts. This is not food, so the 0–100 score doesn&apos;t apply — it is built
                from Nutri-Score, processing level and additives, none of which exist for a cosmetic.
              </p>
            )}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">Scan history</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted">No products scanned yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {history.map((h) => {
              const scored = h.healthScore !== null ? scoreLabel(h.healthScore) : null;
              return (
                <li key={h.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    {h.imageUrl && (
                      <Image src={h.imageUrl} alt="" width={32} height={32} className="h-8 w-8 rounded-md object-cover" unoptimized />
                    )}
                    <span>{h.name ?? h.barcode}</span>
                    {scored ? (
                      <span className={`text-xs font-semibold ${scored.className}`}>
                        {h.healthScore}/100 · {scored.label}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">cosmetic — not scored</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">{format(h.scannedAt, "MMM d")}</span>
                    <form action={deleteScannedProduct.bind(null, h.id)}>
                      <button type="submit" className="text-muted hover:text-danger">
                        <Trash2 size={14} />
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
