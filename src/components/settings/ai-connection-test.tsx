"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { runAIDiagnostics, type AIDiagnosis } from "@/lib/ai/diagnostics";

export function AIConnectionTest() {
  const [result, setResult] = useState<AIDiagnosis | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3 border-t border-border pt-3">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await runAIDiagnostics()))}
      >
        {pending ? "Testing…" : "Test AI connection"}
      </Button>

      {result && (
        <div
          className={`mt-3 rounded-lg border p-3 text-sm ${
            result.ok ? "border-success/40 bg-success/10" : "border-danger/40 bg-danger/10"
          }`}
        >
          <p className="font-semibold">
            {result.ok ? "✅" : "❌"} {result.headline}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs">{result.detail}</p>
          <p className="mt-2 text-xs text-muted">
            Key: {result.keyHint} · Model: {result.model}
          </p>
        </div>
      )}
    </div>
  );
}
