"use client";

import { useEffect, useState } from "react";
import { sanitizeSvg } from "@/lib/utils/sanitize-svg";

/**
 * An SVG the model wrote, put on screen without trusting a character of it.
 *
 * Two rules, both load-bearing. It goes through the sanitiser before it ever
 * reaches the DOM, and the sanitising happens after mount rather than during
 * render, so the server never emits unsanitised markup — the browser's own
 * parser is what the allowlist is written against.
 *
 * Shared by the chat bubble and the explainer board so a drawing that is safe
 * in one is safe in the other, and there is one place to change if the
 * allowlist ever needs to move.
 */
export function SafeSvg({ code, className }: { code: string; className?: string }) {
  const [safeHtml, setSafeHtml] = useState<string | null>(null);

  useEffect(() => {
    setSafeHtml(sanitizeSvg(code));
  }, [code]);

  if (!safeHtml) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
