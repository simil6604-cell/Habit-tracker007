"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Button } from "@/components/ui/button";

type ScannerControls = { stop: () => void };

export function BarcodeScanner({ onDetected }: { onDetected: (barcode: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Starting the reader from the click handler handed zxing a ref that React
  // hadn't populated yet, because the <video> only mounts once active flips.
  // Waiting for the render means it gets a real element.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    (async () => {
      try {
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          if (!result) return;
          controlsRef.current?.stop();
          controlsRef.current = null;
          setActive(false);
          onDetected(result.getText());
        });
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
            ? "Camera access was denied. Allow the camera for this site in your browser settings, then try again — or type the barcode in above."
            : /NotFound|no camera/i.test(message)
              ? "No camera was found on this device — type the barcode in above instead."
              : `Couldn't start the camera${message ? `: ${message}` : ""}. You can still type the barcode in above.`
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
          <Button type="button" size="sm" variant="outline" onClick={() => setActive(false)} className="self-start">
            Stop camera
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setError(null);
            setActive(true);
          }}
          className="self-start"
        >
          📷 Scan with camera
        </Button>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
