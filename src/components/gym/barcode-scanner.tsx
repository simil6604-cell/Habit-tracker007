"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { cameraConstraints, retailBarcodeHints } from "@/lib/gym/barcode-formats";

type ScannerControls = { stop: () => void };

/**
 * Two ways to read a barcode, because one of them does not work on every phone.
 *
 * Live scanning needs the camera to hold focus on a small striped rectangle
 * while a decoder reads frames. On a phone that often means holding still at
 * exactly the right distance, and on iOS the browser gives no way to ask for
 * macro focus — so it can sit there looking like it works and never read
 * anything, which is exactly what happened.
 *
 * Taking a photo hands the job to the phone's own camera app, which focuses
 * properly and returns a full-resolution still. Decoding that one picture is
 * far more reliable than decoding a stream, and it also gives the shutter
 * button people expect to find when a camera is on screen.
 */
export function BarcodeScanner({ onDetected }: { onDetected: (barcode: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const [active, setActive] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Starting the reader from the click handler handed zxing a ref that React
  // hadn't populated yet, because the <video> only mounts once active flips.
  // Waiting for the render means it gets a real element.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    (async () => {
      try {
        const reader = new BrowserMultiFormatReader(retailBarcodeHints());
        const controls = await reader.decodeFromConstraints(
          cameraConstraints(),
          videoRef.current!,
          (result) => {
            if (!result) return;
            controlsRef.current?.stop();
            controlsRef.current = null;
            setActive(false);
            onDetected(result.getText());
          }
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "";
        setError(
          /permission|denied|NotAllowed/i.test(message)
            ? "Camera access was denied. Allow the camera for this site in your browser settings, then try again — or take a photo of the barcode instead."
            : /NotFound|no camera/i.test(message)
              ? "No camera was found on this device — type the barcode in above instead."
              : `Couldn't start the camera${message ? `: ${message}` : ""}. Try the photo button, or type the barcode in above.`
        );
        setActive(false);
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [active, onDetected]);

  /** Decode one still photo of the barcode. */
  async function readPhoto(file: File) {
    setError(null);
    setReading(true);
    const url = URL.createObjectURL(file);
    try {
      const reader = new BrowserMultiFormatReader(retailBarcodeHints());
      const result = await reader.decodeFromImageUrl(url);
      onDetected(result.getText());
    } catch {
      // zxing throws NotFoundException when the picture holds no code. Said in
      // terms of what to do differently, not as an error class.
      setError(
        "No barcode found in that photo. Fill the frame with the barcode, hold the phone steady and straight above it, and make sure the stripes are in focus."
      );
    } finally {
      setReading(false);
      URL.revokeObjectURL(url);
      if (photoRef.current) photoRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {active ? (
        <>
          <video
            ref={videoRef}
            muted
            autoPlay
            // Without playsInline iOS refuses to show a camera stream inline.
            playsInline
            className="aspect-video w-full max-w-sm rounded-lg bg-black object-cover"
          />
          <p className="max-w-sm text-xs text-muted">
            Hold the barcode so it fills the width of the picture. If nothing happens after a few seconds, stop and
            use <strong>Take a photo</strong> — that works where live scanning doesn&apos;t.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => setActive(false)} className="self-start">
            Stop camera
          </Button>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setError(null);
              setActive(true);
            }}
          >
            📷 Scan with camera
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={reading}
            onClick={() => photoRef.current?.click()}
          >
            {reading ? "Reading…" : "🖼 Take a photo"}
          </Button>
        </div>
      )}

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        // capture opens the camera straight away rather than the photo library,
        // which is the whole point of this button.
        capture="environment"
        className="hidden"
        data-testid="barcode-photo-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void readPhoto(file);
        }}
      />

      {error && <p className="max-w-sm text-xs text-danger">{error}</p>}
    </div>
  );
}
