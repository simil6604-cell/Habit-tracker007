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

  useEffect(() => {
    return () => controlsRef.current?.stop();
  }, []);

  async function start() {
    setError(null);
    setActive(true);
    try {
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result) {
          controlsRef.current?.stop();
          controlsRef.current = null;
          setActive(false);
          onDetected(result.getText());
        }
      });
      controlsRef.current = controls;
    } catch (err) {
      setError(
        err instanceof Error
          ? `Couldn't access the camera: ${err.message}`
          : "Couldn't access the camera. You can still type the barcode in above."
      );
      setActive(false);
    }
  }

  function stop() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setActive(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {active ? (
        <>
          <video ref={videoRef} muted className="aspect-video w-full max-w-sm rounded-lg bg-black object-cover" />
          <Button type="button" size="sm" variant="outline" onClick={stop} className="self-start">
            Stop camera
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" variant="secondary" onClick={start} className="self-start">
          📷 Scan with camera
        </Button>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
