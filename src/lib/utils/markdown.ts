/**
 * Plain module, deliberately not a client component: the notes overview is a
 * server component and renders this during the server pass. Exporting it from
 * the "use client" renderer made Next refuse the call at runtime with a 500.
 */

/**
 * The same text with its Markdown markers removed, for places that show a
 * clamped preview where rendering real blocks would break the clamp.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .trim();
}
