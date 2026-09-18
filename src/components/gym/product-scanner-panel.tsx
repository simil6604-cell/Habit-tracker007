"use client";

import { useActionState, useRef } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { scanProductAction, deleteScannedProduct, type ScanState } from "@/lib/gym/scanner-actions";
import { scoreLabel } from "@/lib/gym/health-score";
import { Button } from "@/components/ui/button";
import { BarcodeScanner } from "./barcode-scanner";

type ScannedProduct = {
  id: string;
  barcode: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
  healthScore: number;
  scannedAt: Date;
};

export function ProductScannerPanel({ history }: { history: ScannedProduct[] }) {
  const [state, formAction, pending] = useActionState<ScanState, FormData>(scanProductAction, undefined);
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
        Looks the barcode up against Open Food Facts, a real, free, crowd-sourced product database — never invented
        product data. The 0–100 score is this app&apos;s own transparent estimate (not Yuka&apos;s score, and not
        medical advice), built from Nutri-Score, processing level (NOVA) and additive count when Open Food Facts has
        that data on file.
      </p>

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
              const { label, className } = scoreLabel(h.healthScore);
              return (
                <li key={h.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    {h.imageUrl && (
                      <Image src={h.imageUrl} alt="" width={32} height={32} className="h-8 w-8 rounded-md object-cover" unoptimized />
                    )}
                    <span>{h.name ?? h.barcode}</span>
                    <span className={`text-xs font-semibold ${className}`}>{h.healthScore}/100 · {label}</span>
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
