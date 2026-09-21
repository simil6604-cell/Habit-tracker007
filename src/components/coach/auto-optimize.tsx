"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { triggerWeeklyOptimization } from "@/lib/ai/coach-actions";

export function AutoOptimize({ shouldRun }: { shouldRun: boolean }) {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (!shouldRun || ran.current) return;
    ran.current = true;
    (async () => {
      await triggerWeeklyOptimization();
      router.replace("/coach");
      router.refresh();
    })();
  }, [shouldRun, router]);

  return null;
}
