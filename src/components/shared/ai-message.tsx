"use client";

import { useEffect, useState } from "react";
import { sanitizeSvg } from "@/lib/utils/sanitize-svg";

/**
 * Renders an SVG the AI wrote. It's model output, so it goes through the
 * sanitizer before it ever reaches the DOM, and after mount rather than
 * during render so the server never emits unsanitized markup.
 */
function SvgDiagram({ code }: { code: string }) {
  const [safeHtml, setSafeHtml] = useState<string | null>(null);
  useEffect(() => {
    setSafeHtml(sanitizeSvg(code));
  }, [code]);
  if (!safeHtml) return null;
  return (
    // The sanitizer drops width/height so the drawing scales to its viewBox.
    // Capping the height keeps a sparsely-drawn diagram from claiming a huge
    // block of empty white inside the message.
    <div
      className="mt-2 rounded-lg border border-border bg-white p-2 [&>svg]:mx-auto [&>svg]:block [&>svg]:max-h-72 [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}

/**
 * An AI reply: prose, with any ```svg blocks turned into the diagram they
 * describe. Shared by the topic tutor and the coach so a drawn example looks
 * and behaves the same in both.
 */
export function AIMessageContent({ content }: { content: string }) {
  const parts: { type: "text" | "svg"; value: string }[] = [];
  const regex = /```svg\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    parts.push({ type: "svg", value: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) parts.push({ type: "text", value: content.slice(lastIndex) });

  return (
    <>
      {parts.map((p, i) =>
        p.type === "text" ? (
          p.value.trim() && (
            <p key={i} className="whitespace-pre-wrap text-sm">
              {p.value.trim()}
            </p>
          )
        ) : (
          <SvgDiagram key={i} code={p.value} />
        )
      )}
    </>
  );
}
