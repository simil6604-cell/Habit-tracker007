import { cn } from "@/lib/utils";

const ACCENT: Record<string, { text: string; line: string; tint: string }> = {
  school: { text: "text-cat-school", line: "bg-cat-school", tint: "from-cat-school/12" },
  gym: { text: "text-cat-gym", line: "bg-cat-gym", tint: "from-cat-gym/12" },
  football: { text: "text-cat-football", line: "bg-cat-football", tint: "from-cat-football/12" },
  overview: { text: "text-accent", line: "bg-accent", tint: "from-accent/12" },
};

/**
 * The band that starts each domain's block.
 *
 * The page was one colour of card, stacked twelve deep, and reading it meant
 * reading every title to work out which part of your life you were looking
 * at. A coloured rule and a tinted wash give each domain a visible start, so
 * the eye can jump to "the gym one" without reading anything — and it uses
 * the same three hues as the sidebar, the heroes and the charts, so the
 * colour already means something before this page uses it.
 */
export function SectionHeading({
  domain,
  emoji,
  title,
  subtitle,
}: {
  domain: "school" | "gym" | "football" | "overview";
  emoji: string;
  title: string;
  subtitle: string;
}) {
  const accent = ACCENT[domain];
  return (
    <div className={cn("relative mt-8 overflow-hidden rounded-2xl bg-gradient-to-r to-transparent px-4 py-3.5 first:mt-0", accent.tint)}>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", accent.line)} />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pl-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span aria-hidden>{emoji}</span>
          <span className={accent.text}>{title}</span>
        </h2>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>
    </div>
  );
}
