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
 * Inline **bold** as real elements.
 *
 * Built from React nodes rather than injected HTML: this is model output, and
 * the one thing it must never be able to do is bring markup with it. React
 * escapes every text node here, so the worst a stray "<script>" can do is
 * appear on screen as those characters.
 */
function inline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    )
  );
}

/**
 * The small slice of Markdown the assistant actually uses — headings, bullets
 * and bold. Without this a revision answer shows its own "##" and "**" as
 * literal characters, which reads as broken rather than as structure.
 */
export function AIProse({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="ml-4 list-disc space-y-0.5 text-sm">
        {items.map((b, i) => (
          <li key={i}>{inline(b, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>
    );
  };

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flushBullets();

    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push(
        <p key={`h-${blocks.length}`} className="mt-1 text-xs font-semibold uppercase tracking-wide text-accent">
          {inline(heading[1], `h-${blocks.length}`)}
        </p>
      );
      continue;
    }
    if (!line.trim()) continue;
    blocks.push(
      <p key={`p-${blocks.length}`} className="whitespace-pre-wrap text-sm">
        {inline(line, `p-${blocks.length}`)}
      </p>
    );
  }
  flushBullets();

  return <div className="flex flex-col gap-1.5">{blocks}</div>;
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
          p.value.trim() && <AIProse key={i} text={p.value.trim()} />
        ) : (
          <SvgDiagram key={i} code={p.value} />
        )
      )}
    </>
  );
}
